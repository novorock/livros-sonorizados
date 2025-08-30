document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ app.js carregado");

  const exemploBtn = document.querySelector("button"); // só para teste
  if (exemploBtn) {
    exemploBtn.addEventListener("click", () => {
      alert("Botão clicado! JS funcionando 🚀");
    });
  }
});
