const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
let dbQueue = Promise.resolve();

const routes = [
  { from: "Harare", to: "Bulawayo", fare: 35, dropoff: "Rainbow Towers Bulawayo", times: ["07:00", "10:00", "14:00"] },
  { from: "Harare", to: "Chegutu", fare: 25, dropoff: "Chegutu Hotel", times: ["07:00", "10:00", "14:00"] },
  { from: "Harare", to: "Kadoma", fare: 30, dropoff: "Sichel Service", times: ["07:00", "10:00", "14:00"] },
  { from: "Harare", to: "Kwekwe", fare: 30, dropoff: "King Solomon Hotel", times: ["07:00", "10:00", "14:00"] },
  { from: "Harare", to: "Gweru", fare: 30, dropoff: "Clonsilla Chicken Inn", times: ["07:00", "10:00", "14:00"] },
  { from: "Bulawayo", to: "Harare", fare: 35, dropoff: "Travel Plaza Harare", times: ["07:00", "10:00", "14:00"] },
  { from: "Bulawayo", to: "Gweru", fare: 25, dropoff: "Clonsilla Chicken Inn", times: ["07:00", "10:00"] },
  { from: "Bulawayo", to: "Kwekwe", fare: 25, dropoff: "Golden Mile Kwekwe", times: ["07:00", "10:00"] },
  { from: "Bulawayo", to: "Kadoma", fare: 30, dropoff: "Sichel Service", times: ["07:00", "10:00"] },
  { from: "Bulawayo", to: "Chegutu", fare: 30, dropoff: "Chegutu Hotel", times: ["07:00", "10:00"] }
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp"
};

async function ensureDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_FILE);
  } catch {
    await fs.writeFile(DB_FILE, JSON.stringify({ bookings: [], messages: [] }, null, 2));
  }
}

async function readDb() {
  await ensureDb();
  return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
}

async function writeDb(db) {
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function updateDb(mutator) {
  const next = dbQueue.then(async () => {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  });
  dbQueue = next.catch(() => {});
  return next;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendPdf(res, filename, pdfBuffer) {
  res.writeHead(200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": pdfBuffer.length
  });
  res.end(pdfBuffer);
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function requireFields(payload, fields) {
  return fields.filter((field) => !String(payload[field] || "").trim());
}

function findRoute(from, to) {
  return routes.find((route) => route.from === from && route.to === to);
}

function bookingTotal(route, passengers, discount) {
  const count = Math.max(Number(passengers) || 1, 1);
  const base = route.fare * count;
  const discountValue = discount === "senior" || discount === "minor" || discount === "rtg" ? 5 * count : 0;
  return Math.max(base - discountValue, 0);
}

function isPastDate(dateValue) {
  const selected = new Date(`${dateValue}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Number.isNaN(selected.getTime()) || selected < today;
}

function pdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function createTicketPdf(booking) {
  const lines = [
    "CityLink Luxury Coaches",
    "Booking Confirmation",
    "",
    `Reference: ${booking.id}`,
    `Status: ${booking.status}`,
    `Passenger: ${booking.passengerName}`,
    `Email: ${booking.email}`,
    `Phone: ${booking.phone}`,
    "",
    `Route: ${booking.from} to ${booking.to}`,
    `Date: ${booking.date}`,
    `Departure: ${booking.time}`,
    `Passengers: ${booking.passengers}`,
    `Drop-off: ${booking.dropoff}`,
    `Fare per seat: $${booking.farePerSeat}`,
    `Total: $${booking.total}`,
    "",
    "Important:",
    "Please arrive at least 30 minutes before departure.",
    "Bring a valid ID for office-issued discounts.",
    "Customer Care: 0776 999 222 / 0776 999 666 / 0242 777 168",
    "Email: info@citylinkcoaches.co.zw"
  ];

  const content = [
    "q",
    "0.96 0.94 0.89 rg",
    "0 0 612 792 re f",
    "0.06 0.48 0.37 rg",
    "0 700 612 92 re f",
    "1 1 1 rg",
    "BT /F1 28 Tf 56 744 Td (CityLink Luxury Coaches) Tj ET",
    "BT /F2 13 Tf 56 720 Td (Premium passenger transport across Zimbabwe) Tj ET",
    "Q",
    "BT /F1 18 Tf 56 660 Td (Booking Confirmation) Tj ET",
    "0.12 0.14 0.18 rg"
  ];

  let y = 628;
  lines.slice(3).forEach((line) => {
    const font = line.endsWith(":") ? "/F1 12 Tf" : "/F2 11 Tf";
    content.push(`BT ${font} 56 ${y} Td (${pdfText(line)}) Tj ET`);
    y -= line ? 22 : 12;
  });

  const stream = content.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/routes") {
    return sendJson(res, 200, { routes });
  }

  if (req.method === "GET" && url.pathname === "/api/bookings") {
    const db = await readDb();
    return sendJson(res, 200, { bookings: db.bookings });
  }

  const ticketMatch = url.pathname.match(/^\/api\/bookings\/([^/]+)\/ticket$/);
  if (req.method === "GET" && ticketMatch) {
    const db = await readDb();
    const booking = db.bookings.find((item) => item.id === ticketMatch[1]);
    if (!booking) {
      return sendJson(res, 404, { error: "Booking not found." });
    }

    return sendPdf(res, `${booking.id}-citylink-ticket.pdf`, createTicketPdf(booking));
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const payload = await collectBody(req);
    const missing = requireFields(payload, ["from", "to", "date", "time", "passengerName", "email", "phone"]);
    const route = findRoute(payload.from, payload.to);

    if (missing.length || !route) {
      return sendJson(res, 400, { error: "Please complete the trip and passenger details." });
    }

    if (!route.times.includes(payload.time)) {
      return sendJson(res, 400, { error: "Selected departure time is not available for this route." });
    }

    if (isPastDate(payload.date)) {
      return sendJson(res, 400, { error: "Please choose today or a future travel date." });
    }

    const passengers = Math.min(Math.max(Number(payload.passengers) || 1, 1), 8);
    const booking = {
      id: `CL-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
      status: "Reserved",
      from: payload.from,
      to: payload.to,
      date: payload.date,
      time: payload.time,
      passengers,
      passengerName: String(payload.passengerName).trim(),
      email: String(payload.email).trim(),
      phone: String(payload.phone).trim(),
      discount: payload.discount || "none",
      pickupNote: payload.pickupNote || "",
      farePerSeat: route.fare,
      total: bookingTotal(route, passengers, payload.discount),
      dropoff: route.dropoff,
      createdAt: new Date().toISOString()
    };

    await updateDb((db) => {
      db.bookings.unshift(booking);
      return booking;
    });
    return sendJson(res, 201, {
      booking,
      ticketUrl: `/api/bookings/${booking.id}/ticket`,
      message: `Thank you ${booking.passengerName}. Your CityLink seat is reserved. Download your PDF ticket and keep reference ${booking.id}.`
    });
  }

  if (req.method === "POST" && url.pathname === "/api/contact") {
    const payload = await collectBody(req);
    const missing = requireFields(payload, ["name", "email", "message"]);
    if (missing.length) {
      return sendJson(res, 400, { error: "Please add your name, email, and message." });
    }

    const message = {
      id: crypto.randomUUID(),
      name: String(payload.name).trim(),
      email: String(payload.email).trim(),
      phone: String(payload.phone || "").trim(),
      message: String(payload.message).trim(),
      createdAt: new Date().toISOString()
    };
    await updateDb((db) => {
      db.messages.unshift(message);
      return message;
    });
    return sendJson(res, 201, { message: "Thank you. CityLink will get back to you shortly." });
  }

  return sendJson(res, 404, { error: "API endpoint not found." });
}

async function serveStatic(req, res) {
  const cleanUrl = decodeURIComponent(req.url.split("?")[0]);
  const requested = cleanUrl === "/" ? "/index.html" : cleanUrl;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    res.end(file);
  } catch {
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "Content-Type": mimeTypes[".html"] });
    res.end(fallback);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
    } else {
      await serveStatic(req, res);
    }
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Unexpected server error." });
  }
});

ensureDb().then(() => {
  server.listen(PORT, () => {
    console.log(`CityLink Luxury Coaches is running at http://localhost:${PORT}`);
  });
});
