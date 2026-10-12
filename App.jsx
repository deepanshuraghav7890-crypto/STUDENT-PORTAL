import React, { useCallback, useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000/api";

async function request(path, { method = "GET", body, token } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new Error("Server se connect nahi ho paya. Server wali window me npm run dev chal raha hai?");
  }
  let data = {};
  try {
    data = await res.json();
  } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || "Kuch galat ho gaya");
    err.status = res.status;
    throw err;
  }
  return data;
}

const sum = (rows, key) => rows.reduce((t, r) => t + Number(r[key] || 0), 0);
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const today = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

/* ---------------- Login ---------------- */
function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await request("/login", { method: "POST", body: { username, password } });
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">🎓</div>
        <h1>Student Portal</h1>
        <p className="muted">Login karo</p>
        {error && <div className="alert error">{error}</div>}
        <input placeholder="Username / Roll No" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Wait..." : "Login"}
        </button>
       <p className="hint">Admin: admin / admin123 &nbsp;|&nbsp; Student: student / student123</p>
      </form>
    </div>
  );
}

/* ---------------- Chhota reusable form ---------------- */
function AddForm({ fields, onSubmit, label }) {
  const initial = () => {
    const o = {};
    fields.forEach((f) => {
      o[f.name] = f.value || "";
    });
    return o;
  };
  const [vals, setVals] = useState(initial);

  const submit = async (e) => {
    e.preventDefault();
    const ok = await onSubmit(vals);
    if (ok) setVals(initial());
  };

  return (
    <form className="inline-form" onSubmit={submit}>
      {fields.map((f) =>
        f.options ? (
          <select key={f.name} value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}>
            {f.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f.name}
            type={f.type || "text"}
            placeholder={f.placeholder}
            value={vals[f.name]}
            onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}
          />
        )
      )}
      <button className="btn primary" type="submit">
        {label}
      </button>
    </form>
  );
}

/* ---------------- Marks + Attendance + Fees ---------------- */
function Records({ api, studentId, canEdit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api("/students/" + studentId + "/records"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }, [api, studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // action chalao, fir data reload karo. Success par true return karta hai.
  const act = async (fn) => {
    try {
      await fn();
      setError("");
      await load();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };

  if (!data) return <p className="muted">{error || "Loading..."}</p>;

  const { student, marks, attendance, fees } = data;
  const presentCount = attendance.filter((a) => a.status === "Present").length;
  const attPct = attendance.length ? Math.round((presentCount * 100) / attendance.length) : 0;
  const maxTotal = sum(marks, "maxMarks");
  const markPct = maxTotal ? Math.round((sum(marks, "marks") * 100) / maxTotal) : 0;
  const pending = sum(fees.filter((f) => f.paid !== "Yes"), "amount");

  return (
    <div>
      <h2 className="page-title">
        {student.name} <span className="badge">{student.rollNo || "No Roll No"}</span>
      </h2>
      <p className="muted">
        {student.course || "Course nahi diya"} {student.email ? "• " + student.email : ""} {student.phone ? "• " + student.phone : ""}
      </p>

      {error && <div className="alert error">{error}</div>}

      <div className="cards">
        <div className="card stat blue">
          <span>Attendance</span>
          <b>{attPct}%</b>
          <div className="bar">
            <i style={{ width: attPct + "%" }} />
          </div>
        </div>
        <div className="card stat green">
          <span>Marks</span>
          <b>{markPct}%</b>
          <div className="bar">
            <i style={{ width: markPct + "%" }} />
          </div>
        </div>
        <div className="card stat orange">
          <span>Fees Pending</span>
          <b>{money(pending)}</b>
        </div>
      </div>

      {/* MARKS */}
      <div className="panel">
        <h3>📝 Marks</h3>
        {canEdit && (
          <AddForm
            label="Add Marks"
            onSubmit={(v) => act(() => api("/marks", { method: "POST", body: { ...v, studentId } }))}
            fields={[
              { name: "subject", placeholder: "Subject" },
              { name: "marks", placeholder: "Marks", type: "number" },
              { name: "maxMarks", placeholder: "Max Marks (100)", type: "number" },
            ]}
          />
        )}
        <table>
          <thead>
            <tr>
              <th>Subject</th>
              <th>Marks</th>
              <th>Out of</th>
              <th>%</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {marks.length === 0 && (
              <tr>
                <td colSpan="5" className="empty">Abhi koi marks nahi</td>
              </tr>
            )}
            {marks.map((m) => (
              <tr key={m.id}>
                <td>{m.subject}</td>
                <td>{m.marks}</td>
                <td>{m.maxMarks}</td>
                <td>{Math.round((m.marks * 100) / m.maxMarks)}%</td>
                {canEdit && (
                  <td>
                    <button className="btn small danger" onClick={() => act(() => api("/marks/" + m.id, { method: "DELETE" }))}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ATTENDANCE */}
      <div className="panel">
        <h3>📅 Attendance</h3>
        {canEdit && (
          <AddForm
            label="Save Attendance"
            onSubmit={(v) => act(() => api("/attendance", { method: "POST", body: { ...v, studentId } }))}
            fields={[
              { name: "date", type: "date", value: today() },
              { name: "status", options: ["Present", "Absent"], value: "Present" },
            ]}
          />
        )}
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {attendance.length === 0 && (
              <tr>
                <td colSpan="3" className="empty">Abhi koi attendance nahi</td>
              </tr>
            )}
            {attendance.map((a) => (
              <tr key={a.id}>
                <td>{a.date}</td>
                <td>
                  <span className={"pill " + (a.status === "Present" ? "ok" : "bad")}>{a.status}</span>
                </td>
                {canEdit && (
                  <td>
                    <button className="btn small danger" onClick={() => act(() => api("/attendance/" + a.id, { method: "DELETE" }))}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FEES */}
      <div className="panel">
        <h3>💰 Fees</h3>
        {canEdit && (
          <AddForm
            label="Add Fee"
            onSubmit={(v) => act(() => api("/fees", { method: "POST", body: { ...v, paid: v.paid === "Paid", studentId } }))}
            fields={[
              { name: "title", placeholder: "Fee title (e.g. Tuition)" },
              { name: "amount", placeholder: "Amount", type: "number" },
              { name: "paid", options: ["Pending", "Paid"], value: "Pending" },
            ]}
          />
        )}
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Paid On</th>
              {canEdit && <th></th>}
            </tr>
          </thead>
          <tbody>
            {fees.length === 0 && (
              <tr>
                <td colSpan="5" className="empty">Abhi koi fee nahi</td>
              </tr>
            )}
            {fees.map((f) => (
              <tr key={f.id}>
                <td>{f.title}</td>
                <td>{money(f.amount)}</td>
                <td>
                  <span className={"pill " + (f.paid === "Yes" ? "ok" : "warn")}>{f.paid === "Yes" ? "Paid" : "Pending"}</span>
                </td>
                <td>{f.date || "-"}</td>
                {canEdit && (
                  <td className="actions">
                    <button className="btn small" onClick={() => act(() => api("/fees/" + f.id, { method: "PUT", body: { paid: f.paid !== "Yes" } }))}>
                      {f.paid === "Yes" ? "Mark Pending" : "Mark Paid"}
                    </button>
                    <button className="btn small danger" onClick={() => act(() => api("/fees/" + f.id, { method: "DELETE" }))}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Admin dashboard ---------------- */
function AdminDashboard({ api, name }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/stats")
      .then(setStats)
      .catch((e) => setError(e.message));
  }, [api]);

  if (!stats) return <p className="muted">{error || "Loading..."}</p>;
  return (
    <div>
      <h2 className="page-title">Welcome, {name} 👋</h2>
      <p className="muted">Poore portal ka summary yahan hai.</p>
      <div className="cards">
        <div className="card stat blue">
          <span>Total Students</span>
          <b>{stats.students}</b>
        </div>
        <div className="card stat green">
          <span>Fees Collected</span>
          <b>{money(stats.feesPaid)}</b>
        </div>
        <div className="card stat orange">
          <span>Fees Pending</span>
          <b>{money(stats.feesPending)}</b>
        </div>
        <div className="card stat purple">
          <span>Avg Attendance</span>
          <b>{stats.attendancePercent}%</b>
        </div>
      </div>
      <p className="muted">Students page par jao: student add karo, search karo, aur "Open" se marks, attendance, fees manage karo.</p>
    </div>
  );
}

/* ---------------- Students list (add / edit / search) ---------------- */
const emptyForm = { rollNo: "", name: "", email: "", course: "", phone: "" };

function Students({ api, onOpen }) {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setStudents(await api("/students"));
    } catch (e) {
      setError(e.message);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setMsg("");
    try {
      if (editId) {
        await api("/students/" + editId, { method: "PUT", body: form });
        setMsg("Student update ho gaya");
      } else {
        await api("/students", { method: "POST", body: form });
        setMsg("Student add ho gaya. Login: Roll No, password: student123");
      }
      setForm(emptyForm);
      setEditId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (s) => {
    setEditId(s.id);
    setForm({ rollNo: String(s.rollNo), name: String(s.name), email: String(s.email), course: String(s.course), phone: String(s.phone) });
    setMsg("");
    setError("");
  };

  const cancelEdit = () => {
    setEditId(null);
    setForm(emptyForm);
  };

  const remove = async (s) => {
    if (!window.confirm(s.name + " ko delete karna hai? Uske marks, attendance, fees aur login bhi delete honge.")) return;
    try {
      await api("/students/" + s.id, { method: "DELETE" });
      if (editId === s.id) cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const q = search.trim().toLowerCase();
  const shown = students.filter((s) => [s.name, s.rollNo, s.email, s.course, s.phone].join(" ").toLowerCase().includes(q));

  return (
    <div>
      <h2 className="page-title">Students</h2>
      {msg && <div className="alert ok">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <form className="panel inline-form" onSubmit={save}>
        <input name="rollNo" placeholder="Roll No *" value={form.rollNo} onChange={change} />
        <input name="name" placeholder="Name *" value={form.name} onChange={change} />
        <input name="email" placeholder="Email" value={form.email} onChange={change} />
        <input name="course" placeholder="Course" value={form.course} onChange={change} />
        <input name="phone" placeholder="Phone" value={form.phone} onChange={change} />
        <button className="btn primary" type="submit">
          {editId ? "Update" : "Add Student"}
        </button>
        {editId && (
          <button className="btn" type="button" onClick={cancelEdit}>
            Cancel
          </button>
        )}
      </form>

      <div className="panel">
        <input className="search" placeholder="🔍 Search by name, roll no, course..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <table>
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Name</th>
              <th>Email</th>
              <th>Course</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan="6" className="empty">{students.length ? "Search se koi student nahi mila" : "Abhi koi student nahi"}</td>
              </tr>
            )}
            {shown.map((s) => (
              <tr key={s.id}>
                <td>{s.rollNo || <span className="pill warn">Roll No daalo</span>}</td>
                <td>
                  <div className="person">
                    <span className="avatar">{String(s.name).charAt(0).toUpperCase()}</span>
                    {s.name}
                  </div>
                </td>
                <td>{s.email}</td>
                <td>{s.course}</td>
                <td>{s.phone}</td>
                <td className="actions">
                  <button className="btn small primary" onClick={() => onOpen(s.id)}>
                    Open
                  </button>
                  <button className="btn small" onClick={() => startEdit(s)}>
                    Edit
                  </button>
                  <button className="btn small danger" onClick={() => remove(s)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Password change ---------------- */
function ChangePassword({ api }) {
  const [oldPassword, setOld] = useState("");
  const [newPassword, setNew] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");
    if (newPassword !== again) return setError("Dono naye password same hone chahiye");
    try {
      await api("/change-password", { method: "POST", body: { oldPassword, newPassword } });
      setMsg("Password badal gaya");
      setOld("");
      setNew("");
      setAgain("");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h2 className="page-title">Password Change</h2>
      <form className="panel narrow" onSubmit={submit}>
        {msg && <div className="alert ok">{msg}</div>}
        {error && <div className="alert error">{error}</div>}
        <input type="password" placeholder="Purana password" value={oldPassword} onChange={(e) => setOld(e.target.value)} />
        <input type="password" placeholder="Naya password (min 6)" value={newPassword} onChange={(e) => setNew(e.target.value)} />
        <input type="password" placeholder="Naya password dobara" value={again} onChange={(e) => setAgain(e.target.value)} />
        <button className="btn primary" type="submit">
          Change Password
        </button>
      </form>
    </div>
  );
}

/* ---------------- Main App ---------------- */
export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!localStorage.getItem("token"));
  const [page, setPage] = useState("dashboard");
  const [selected, setSelected] = useState(null);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken("");
    setUser(null);
    setPage("dashboard");
    setSelected(null);
  }, []);

  // page refresh par login yaad rakho
  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    request("/me", { token })
      .then((u) => setUser(u))
      .catch(() => logout())
      .finally(() => setChecking(false));
  }, [token, logout]);

  const api = useCallback(
    (path, opts) =>
      request(path, { ...opts, token }).catch((e) => {
        if (e.status === 401) logout();
        throw e;
      }),
    [token, logout]
  );

  const handleLogin = (t, u) => {
    localStorage.setItem("token", t);
    setToken(t);
    setUser(u);
    setPage("dashboard");
  };

  if (checking) return <p className="muted center">Loading...</p>;
  if (!user) return <Login onLogin={handleLogin} />;

  const isAdmin = user.role === "admin";
  const nav = isAdmin
    ? [["dashboard", "📊 Dashboard"], ["students", "👥 Students"], ["password", "🔑 Password"]]
    : [["dashboard", "📊 My Dashboard"], ["password", "🔑 Password"]];

  return (
    <div className="layout"> 
      <aside className="sidebar">
        <div className="brand">🎓 Student Portal</div>
        {nav.map(([key, label]) => (
          <button
            key={key}
            className={"nav-btn" + (page === key ? " active" : "")}
            onClick={() => {
              setPage(key);
              setSelected(null);
            }}
          >
            {label}
          </button>
        ))}
        <div className="sidebar-footer">
          <div className="who">
            {user.name}
            <small>{user.role}</small>
          </div>
          <button className="nav-btn" onClick={logout}>
            🚪 Logout
          </button>
        </div>
      </aside>

      <main className="main">
        {page === "password" && <ChangePassword api={api} />}
        {page === "dashboard" && (isAdmin ? <AdminDashboard api={api} name={user.name} /> : <Records api={api} studentId={user.studentId} canEdit={false} />)}
        {page === "students" && isAdmin && !selected && <Students api={api} onOpen={setSelected} />}
        {page === "students" && isAdmin && selected && (
          <div>
            <button className="btn" onClick={() => setSelected(null)}>
              ← Back to Students
            </button>
            <Records api={api} studentId={selected} canEdit={true} />
          </div>
        )}
      </main>
    </div>
  );
}