const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "student_portal.xlsx");

// Har sheet ke columns
const SCHEMA = {
  Students: ["id", "rollNo", "name", "email", "course", "phone"],
  Users: ["id", "username", "password", "role", "studentId"],
  Marks: ["id", "studentId", "subject", "marks", "maxMarks"],
  Attendance: ["id", "studentId", "date", "status"],
  Fees: ["id", "studentId", "title", "amount", "paid", "date"],
};

let data = null;
let lastId = 0;

const newId = () => {
  lastId = Math.max(Date.now(), lastId + 1);
  return lastId;
};

function normalize(sheet, rows) {
  const headers = SCHEMA[sheet];
  return rows.map((r) => {
    const o = {};
    headers.forEach((h) => {
      o[h] = r[h] === undefined || r[h] === null ? "" : r[h];
    });
    return o;
  });
}

function save() {
  const wb = XLSX.utils.book_new();
  for (const sheet of Object.keys(SCHEMA)) {
    const headers = SCHEMA[sheet];
    const aoa = [headers, ...data[sheet].map((r) => headers.map((h) => r[h]))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheet);
  }
  try {
    XLSX.writeFile(wb, FILE);
  } catch (e) {
    throw new Error(
      "Excel file save nahi hui. Agar student_portal.xlsx Excel me khuli hai to band karo. (" + e.message + ")"
    );
  }
}

function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const wb = fs.existsSync(FILE) ? XLSX.readFile(FILE) : null;
  data = {};
  for (const sheet of Object.keys(SCHEMA)) {
    const ws = wb && wb.Sheets[sheet];
    const rows = ws ? XLSX.utils.sheet_to_json(ws, { defval: "" }) : [];
    data[sheet] = normalize(sheet, rows);
  }
  save();
}

function commit(sheet, rows) {
  const old = data[sheet];
  data[sheet] = rows;
  try {
    save();
  } catch (e) {
    data[sheet] = old;
    throw e;
  }
}

const list = (sheet) => data[sheet].map((r) => ({ ...r }));

const find = (sheet, id) => {
  const r = data[sheet].find((x) => Number(x.id) === Number(id));
  return r ? { ...r } : null;
};

function insert(sheet, row) {
  const rec = normalize(sheet, [{ ...row, id: newId() }])[0];
  commit(sheet, [...data[sheet], rec]);
  return { ...rec };
}

function update(sheet, id, patch) {
  const i = data[sheet].findIndex((x) => Number(x.id) === Number(id));
  if (i === -1) return null;
  const rec = normalize(sheet, [{ ...data[sheet][i], ...patch, id: data[sheet][i].id }])[0];
  const rows = data[sheet].slice();
  rows[i] = rec;
  commit(sheet, rows);
  return { ...rec };
}

function remove(sheet, id) {
  const rows = data[sheet].filter((x) => Number(x.id) !== Number(id));
  if (rows.length === data[sheet].length) return false;
  commit(sheet, rows);
  return true;
}

function removeWhere(sheet, fn) {
  const rows = data[sheet].filter((x) => !fn(x));
  if (rows.length !== data[sheet].length) commit(sheet, rows);
}

init();
module.exports = { list, find, insert, update, remove, removeWhere };