const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const db = require("./excelDb");

const SECRET = process.env.APP_SECRET || "student-portal-dev-secret";
const TOKEN_HOURS = 12;
const DEFAULT_PASSWORD = "student123";

// ---------- password + token helpers ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 32).toString("hex");
}

function checkPassword(pw, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 32).toString("hex");
  return test.length === hash.length && crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}

const sign = (body) => crypto.createHmac("sha256", SECRET).update(body).digest("base64url");

function makeToken(user) {
  const payload = { uid: user.id, exp: Date.now() + TOKEN_HOURS * 3600 * 1000 };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + sign(body);
}

function readToken(token) {
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch (e) {
    return null;
  }
}

// ---------- middleware ----------
function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const payload = readToken(h.startsWith("Bearer ") ? h.slice(7) : "");
  const user = payload && db.find("Users", payload.uid);
  if (!user) return res.status(401).json({ error: "Login required" });
  req.user = user;
  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Sirf admin ke liye" });
  next();
}

const handle = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

// ---------- small helpers ----------
const text = (v) => String(v === undefined || v === null ? "" : v).trim();
const num = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

function userInfo(user) {
  const student = user.studentId !== "" ? db.find("Students", user.studentId) : null;
  return {
    username: user.username,
    role: user.role,
    studentId: student ? student.id : null,
    name: student ? student.name : "Admin",
  };
}

function cleanStudent(b) {
  return {
    rollNo: text(b.rollNo),
    name: text(b.name),
    email: text(b.email),
    course: text(b.course),
    phone: text(b.phone),
  };
}

function rollTaken(roll, exceptStudentId) {
  const r = roll.toLowerCase();
  const inUsers = db.list("Users").some((u) => String(u.username).toLowerCase() === r && Number(u.studentId) !== Number(exceptStudentId));
  const inStudents = db.list("Students").some((s) => String(s.rollNo).toLowerCase() === r && Number(s.id) !== Number(exceptStudentId));
  return inUsers || inStudents;
}

function ensureAccount(student) {
  const acc = db.list("Users").find((u) => u.studentId !== "" && Number(u.studentId) === Number(student.id));
  if (acc) {
    if (acc.username !== student.rollNo) db.update("Users", acc.id, { username: student.rollNo });
  } else {
    db.insert("Users", { username: student.rollNo, password: hashPassword(DEFAULT_PASSWORD), role: "student", studentId: student.id });
  }
}

// ---------- first run: admin account ----------
if (!db.list("Users").some((u) => u.role === "admin")) {
  db.insert("Users", { username: "admin", password: hashPassword("admin123"), role: "admin", studentId: "" });
  console.log("Admin account bana: username = admin, password = admin123");
}

// ---------- app ----------
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Student Portal API running"));

app.post("/api/login", handle((req, res) => {
  const username = text(req.body.username).toLowerCase();
  const password = String(req.body.password || "");
  const user = db.list("Users").find((u) => String(u.username).toLowerCase() === username);
  if (!user || !checkPassword(password, user.password)) {
    return res.status(401).json({ error: "Username ya password galat hai" });
  }
  res.json({ token: makeToken(user), user: userInfo(user) });
}));

app.get("/api/me", auth, handle((req, res) => res.json(userInfo(req.user))));

app.post("/api/change-password", auth, handle((req, res) => {
  if (!checkPassword(String(req.body.oldPassword || ""), req.user.password)) {
    return res.status(400).json({ error: "Purana password galat hai" });
  }
  const np = String(req.body.newPassword || "");
  if (np.length < 6) return res.status(400).json({ error: "Naya password kam se kam 6 character ka ho" });
  db.update("Users", req.user.id, { password: hashPassword(np) });
  res.json({ success: true });
}));

// ----- students (admin) -----
app.get("/api/students", auth, adminOnly, handle((req, res) => res.json(db.list("Students"))));

app.post("/api/students", auth, adminOnly, handle((req, res) => {
  const s = cleanStudent(req.body);
  if (!s.name || !s.rollNo) return res.status(400).json({ error: "Name aur Roll No zaroori hain" });
  if (rollTaken(s.rollNo, -1)) return res.status(409).json({ error: "Ye Roll No pehle se hai" });
  const student = db.insert("Students", s);
  ensureAccount(student);
  res.status(201).json(student);
}));

app.put("/api/students/:id", auth, adminOnly, handle((req, res) => {
  const cur = db.find("Students", req.params.id);
  if (!cur) return res.status(404).json({ error: "Student nahi mila" });
  const s = cleanStudent({ ...cur, ...req.body });
  if (!s.name || !s.rollNo) return res.status(400).json({ error: "Name aur Roll No zaroori hain" });
  if (rollTaken(s.rollNo, cur.id)) return res.status(409).json({ error: "Ye Roll No pehle se hai" });
  const student = db.update("Students", cur.id, s);
  ensureAccount(student);
  res.json(student);
}));

app.delete("/api/students/:id", auth, adminOnly, handle((req, res) => {
  const id = Number(req.params.id);
  if (!db.remove("Students", id)) return res.status(404).json({ error: "Student nahi mila" });
  db.removeWhere("Users", (u) => u.studentId !== "" && Number(u.studentId) === id);
  db.removeWhere("Marks", (r) => Number(r.studentId) === id);
  db.removeWhere("Attendance", (r) => Number(r.studentId) === id);
  db.removeWhere("Fees", (r) => Number(r.studentId) === id);
  res.json({ success: true });
}));

// ----- ek student ka poora record (admin ya khud student) -----
app.get("/api/students/:id/records", auth, handle((req, res) => {
  const id = Number(req.params.id);
  if (req.user.role !== "admin" && Number(req.user.studentId) !== id) {
    return res.status(403).json({ error: "Ye record aapka nahi hai" });
  }
  const student = db.find("Students", id);
  if (!student) return res.status(404).json({ error: "Student nahi mila" });
  const mine = (r) => Number(r.studentId) === id;
  res.json({
    student,
    marks: db.list("Marks").filter(mine),
    attendance: db.list("Attendance").filter(mine).sort((a, b) => String(b.date).localeCompare(String(a.date))),
    fees: db.list("Fees").filter(mine),
  });
}));

// ----- marks / attendance / fees (admin) -----
const resources = {
  marks: {
    sheet: "Marks",
    prepare: (b) => {
      const subject = text(b.subject);
      const marks = num(b.marks);
      const maxMarks = b.maxMarks === undefined || b.maxMarks === "" ? 100 : num(b.maxMarks);
      if (!subject) return { error: "Subject zaroori hai" };
      if (isNaN(marks) || isNaN(maxMarks) || maxMarks <= 0 || marks < 0 || marks > maxMarks) {
        return { error: "Marks 0 se Max Marks ke beech hone chahiye" };
      }
      return { row: { subject, marks, maxMarks } };
    },
  },
  attendance: {
    sheet: "Attendance",
    prepare: (b) => {
      const date = text(b.date);
      const status = text(b.status);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date YYYY-MM-DD format me do" };
      if (status !== "Present" && status !== "Absent") return { error: "Status Present ya Absent hona chahiye" };
      return { row: { date, status } };
    },
    sameAs: (a, b) => a.date === b.date, // same din dobara dalo to update ho jaye
  },
  fees: {
    sheet: "Fees",
    prepare: (b) => {
      const title = text(b.title);
      const amount = num(b.amount);
      const paid = b.paid === true || b.paid === "Yes" ? "Yes" : "No";
      if (!title) return { error: "Fee title zaroori hai" };
      if (isNaN(amount) || amount <= 0) return { error: "Amount 0 se zyada hona chahiye" };
      return { row: { title, amount, paid, date: paid === "Yes" ? text(b.date) || today() : "" } };
    },
  },
};

Object.keys(resources).forEach((name) => {
  const { sheet, prepare, sameAs } = resources[name];

  app.post("/api/" + name, auth, adminOnly, handle((req, res) => {
    const studentId = Number(req.body.studentId);
    if (!db.find("Students", studentId)) return res.status(404).json({ error: "Student nahi mila" });
    const out = prepare(req.body);
    if (out.error) return res.status(400).json({ error: out.error });
    const existing = sameAs && db.list(sheet).find((r) => Number(r.studentId) === studentId && sameAs(r, out.row));
    if (existing) return res.json(db.update(sheet, existing.id, out.row));
    res.status(201).json(db.insert(sheet, { ...out.row, studentId }));
  }));

  app.delete("/api/" + name + "/:id", auth, adminOnly, handle((req, res) => {
    if (!db.remove(sheet, req.params.id)) return res.status(404).json({ error: "Record nahi mila" });
    res.json({ success: true });
  }));
});

app.put("/api/fees/:id", auth, adminOnly, handle((req, res) => {
  const paid = req.body.paid === true || req.body.paid === "Yes";
  const fee = db.update("Fees", req.params.id, { paid: paid ? "Yes" : "No", date: paid ? today() : "" });
  if (!fee) return res.status(404).json({ error: "Record nahi mila" });
  res.json(fee);
}));

// ----- dashboard stats (admin) -----
app.get("/api/stats", auth, adminOnly, handle((req, res) => {
  const fees = db.list("Fees");
  const att = db.list("Attendance");
  const sum = (arr) => arr.reduce((t, f) => t + Number(f.amount || 0), 0);
  const feesTotal = sum(fees);
  const feesPaid = sum(fees.filter((f) => f.paid === "Yes"));
  const present = att.filter((a) => a.status === "Present").length;
  res.json({
    students: db.list("Students").length,
    feesTotal,
    feesPaid,
    feesPending: feesTotal - feesPaid,
    attendancePercent: att.length ? Math.round((present * 100) / att.length) : 0,
  });
}));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on http://localhost:" + PORT));