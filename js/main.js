// Shared UI: nav, reveal-on-scroll, toast, footer year
const nav = document.querySelector(".nav");
const menuBtn = document.querySelector(".menu-btn");
if (nav && menuBtn) {
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  nav.querySelectorAll(".nav-links a").forEach((a) =>
    a.addEventListener("click", () => nav.classList.remove("open"))
  );
}

const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }),
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el, i) => {
  el.style.transitionDelay = `${(el.dataset.delay || 0) * 90}ms`;
  io.observe(el);
});

let toastTimer;
export function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.innerHTML = `<span class="dot"></span><span></span>`;
  t.lastChild.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}
window.fmToast = toast;

// light / dark theme
document.querySelectorAll(".theme-btn").forEach((b) =>
  b.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("fm.theme", next); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === "light" ? "#f7f3f1" : "#070707";
    window.dispatchEvent(new CustomEvent("fm-theme", { detail: next }));
  })
);
if (document.documentElement.dataset.theme === "light") {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#f7f3f1");
}

// block pinch / double-tap zoom on mobile (iOS ignores user-scalable=no)
["gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false })
);
document.addEventListener("touchmove", (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && !e.target.closest("input, textarea, select")) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

// newsletter forms
document.querySelectorAll("form[data-newsletter]").forEach((f) =>
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    f.reset();
    toast("You're on the list. Welcome to FitMirror 360.");
  })
);
