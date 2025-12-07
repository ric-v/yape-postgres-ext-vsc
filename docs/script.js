// Theme toggle
const themeToggle = document.getElementById("theme-toggle")
const htmlElement = document.documentElement

// Load theme preference
const savedTheme = localStorage.getItem("theme") || "dark"
if (savedTheme === "light") {
  htmlElement.classList.add("light-mode")
}

// Toggle theme
themeToggle.addEventListener("click", () => {
  htmlElement.classList.toggle("light-mode")
  const isLight = htmlElement.classList.contains("light-mode")
  localStorage.setItem("theme", isLight ? "light" : "dark")
})

// Mobile menu (optional)
const mobileMenuBtn = document.querySelector(".mobile-menu-btn")
const navLinks = document.querySelector(".nav-links")

if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener("click", () => {
    navLinks.style.display = navLinks.style.display === "flex" ? "none" : "flex"
  })
}
