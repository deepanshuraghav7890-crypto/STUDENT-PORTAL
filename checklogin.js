const crypto = require("crypto");
const db = require("./excelDb");

function matches(pw, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  return crypto.scryptSync(pw, salt, 32).toString("hex") === hash;
}

const students = db.list("Students");
const users = db.list("Users");
console.log("Students sheet me rows:", students.length);
console.log("Users sheet me rows:   ", users.length, "\n");

users.forEach((u) => {
  const pw = u.role === "admin" ? "admin123" : "student123";
  console.log(
    "username=" + JSON.stringify(u.username),
    "| type=" + typeof u.username,
    "| role=" + u.role,
    "| studentId=" + JSON.stringify(u.studentId),
    "| " + pw + " match=" + matches(pw, u.password)
  );
});

console.log("");
students.forEach((s) => {
  const has = users.some((u) => u.studentId !== "" && Number(u.studentId) === Number(s.id));
  console.log("student id=" + s.id, "rollNo=" + JSON.stringify(s.rollNo), "name=" + JSON.stringify(s.name), "| account hai:", has);
});