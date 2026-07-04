const state = {
  routes: [],
  activeRoute: null
};

const $ = (selector) => document.querySelector(selector);
const bookingForm = $("#bookingForm");
const contactForm = $("#contactForm");
const fromSelect = $("#fromSelect");
const toSelect = $("#toSelect");
const timeSelect = $("#timeSelect");
const dateInput = $("#dateInput");
const toast = $("#toast");
const bookingConfirmation = $("#bookingConfirmation");
const confirmationReference = $("#confirmationReference");
const confirmationMessage = $("#confirmationMessage");
const ticketDownload = $("#ticketDownload");

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 4200);
}

function currency(value) {
  return `$${Number(value || 0).toFixed(0)}`;
}

function unique(values) {
  return [...new Set(values)];
}

function populateSelect(select, values) {
  if (!select) return;
  select.innerHTML = values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function routeForSelection() {
  if (!fromSelect || !toSelect) return null;
  return state.routes.find((route) => route.from === fromSelect.value && route.to === toSelect.value);
}

function refreshDestinations() {
  if (!fromSelect || !toSelect) return;
  const destinations = state.routes.filter((route) => route.from === fromSelect.value).map((route) => route.to);
  populateSelect(toSelect, destinations);
  refreshTimes();
}

function refreshTimes() {
  if (!timeSelect) return;
  state.activeRoute = routeForSelection() || state.routes[0];
  if (!state.activeRoute) return;
  populateSelect(timeSelect, state.activeRoute.times);
  updateSummary();
}

function updateSummary() {
  if (!bookingForm) return;
  const formData = new FormData(bookingForm);
  const route = routeForSelection() || state.activeRoute || state.routes[0];
  if (!route) return;

  const passengers = Math.min(Math.max(Number(formData.get("passengers")) || 1, 1), 8);
  const discount = formData.get("discount");
  const discountTotal = ["senior", "minor", "rtg"].includes(discount) ? passengers * 5 : 0;
  const total = Math.max(route.fare * passengers - discountTotal, 0);

  $("#summaryRoute").textContent = `${route.from} to ${route.to}`;
  $("#summaryTime").textContent = timeSelect.value || route.times[0];
  $("#summaryDropoff").textContent = route.dropoff;
  $("#summaryFare").textContent = `${currency(route.fare)} per seat`;
  $("#summaryTotal").textContent = currency(total);
}

function setMinTravelDate() {
  if (!dateInput) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dateInput.min = today.toISOString().slice(0, 10);
  dateInput.value = dateInput.min;
}

async function loadRoutes() {
  if (!bookingForm) return;
  const response = await fetch("/api/routes");
  const data = await response.json();
  state.routes = data.routes;
  populateSelect(fromSelect, unique(state.routes.map((route) => route.from)));
  refreshDestinations();
}

async function submitJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function downloadTicket(ticketUrl, bookingId) {
  const link = document.createElement("a");
  link.href = ticketUrl;
  link.download = `${bookingId}-citylink-ticket.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function initBooking() {
  if (!bookingForm) return;
  fromSelect.addEventListener("change", refreshDestinations);
  toSelect.addEventListener("change", refreshTimes);
  bookingForm.addEventListener("input", updateSummary);
  bookingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await submitJson("/api/bookings", formToObject(bookingForm));
      if (confirmationReference && confirmationMessage && ticketDownload && bookingConfirmation) {
        confirmationReference.textContent = `Reference ${data.booking.id}`;
        confirmationMessage.textContent = `${data.message} Total: ${currency(data.booking.total)}.`;
        ticketDownload.href = data.ticketUrl;
        ticketDownload.download = `${data.booking.id}-citylink-ticket.pdf`;
        bookingConfirmation.hidden = false;
      }
      showToast(`Seat reserved. Your PDF ticket is downloading. Reference ${data.booking.id}.`);
      downloadTicket(data.ticketUrl, data.booking.id);
      bookingForm.reset();
      setMinTravelDate();
      refreshDestinations();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function initContact() {
  if (!contactForm) return;
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await submitJson("/api/contact", formToObject(contactForm));
      showToast(data.message);
      contactForm.reset();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("visible");
      });
    },
    { threshold: 0.14 }
  );

  document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
}

function initMenu() {
  const menuButton = $(".menu-button");
  const nav = $(".nav");
  if (!menuButton || !nav) return;
  menuButton.addEventListener("click", () => nav.classList.toggle("open"));
  document.querySelectorAll(".nav a").forEach((link) => {
    link.addEventListener("click", () => nav.classList.remove("open"));
  });
}

function initGlow() {
  const glow = $(".cursor-glow");
  if (!glow) return;
  window.addEventListener("pointermove", (event) => {
    glow.style.left = `${event.clientX}px`;
    glow.style.top = `${event.clientY}px`;
  });
}

function drawRouteCanvas() {
  const canvas = $("#routeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let tick = 0;

  const points = [
    { x: 170, y: 150, label: "Harare" },
    { x: 290, y: 230, label: "Chegutu" },
    { x: 405, y: 295, label: "Kadoma" },
    { x: 520, y: 365, label: "Kwekwe" },
    { x: 640, y: 420, label: "Gweru" },
    { x: 760, y: 500, label: "Bulawayo" }
  ];

  function frame() {
    tick += 0.008;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bg.addColorStop(0, "rgba(255,255,255,0.62)");
    bg.addColorStop(1, "rgba(15,123,95,0.12)");
    ctx.fillStyle = bg;
    roundRect(ctx, 46, 52, 790, 520, 38);
    ctx.fill();

    ctx.strokeStyle = "rgba(18,21,28,0.09)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 11; i += 1) {
      ctx.beginPath();
      ctx.moveTo(80 + i * 70, 88);
      ctx.lineTo(40 + i * 70, 558);
      ctx.stroke();
    }

    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = "rgba(15,123,95,0.26)";
    ctx.lineWidth = 16;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.strokeStyle = "#d8aa3d";
    ctx.lineWidth = 5;
    ctx.setLineDash([18, 18]);
    ctx.lineDashOffset = -tick * 260;
    ctx.stroke();
    ctx.setLineDash([]);

    points.forEach((point, index) => {
      const pulse = Math.sin(tick * 7 + index) * 3;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(point.x, point.y, 14 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = index === 0 || index === points.length - 1 ? "#0f7b5f" : "#d8aa3d";
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = "#12151c";
      ctx.font = "700 18px Inter, sans-serif";
      ctx.fillText(point.label, point.x + 20, point.y + 6);
    });

    const segment = (Math.sin(tick) + 1) / 2;
    const index = Math.min(Math.floor(segment * (points.length - 1)), points.length - 2);
    const local = segment * (points.length - 1) - index;
    const a = points[index];
    const b = points[index + 1];
    const x = a.x + (b.x - a.x) * local;
    const y = a.y + (b.y - a.y) * local;
    ctx.fillStyle = "#ad3344";
    roundRect(ctx, x - 20, y - 13, 40, 22, 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, x - 12, y - 8, 11, 8, 3);
    roundRect(ctx, x + 3, y - 8, 11, 8, 3);
    ctx.fill();

    requestAnimationFrame(frame);
  }

  frame();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

async function init() {
  setMinTravelDate();
  initMenu();
  initGlow();
  initReveal();
  initBooking();
  initContact();
  drawRouteCanvas();
  await loadRoutes();
}

init().catch((error) => showToast(error.message));
