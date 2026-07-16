/* voxel.blue site JS — vanilla, replaces the jQuery/Bootstrap stack. */
(function () {
  "use strict";

  /* Off-canvas sidebar (<992px) */
  var sidebar = document.getElementById("sidebar");
  var toggle = document.getElementById("nav-toggle");
  var backdrop = document.getElementById("backdrop");

  function setOpen(open) {
    if (!sidebar) return;
    sidebar.classList.toggle("open", open);
    if (backdrop) backdrop.hidden = !open;
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (toggle && sidebar) {
    toggle.addEventListener("click", function () {
      setOpen(!sidebar.classList.contains("open"));
    });
  }
  if (backdrop) {
    backdrop.addEventListener("click", function () {
      setOpen(false);
    });
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") setOpen(false);
  });
  // Close the drawer after navigating via a sidebar link.
  if (sidebar) {
    sidebar.addEventListener("click", function (ev) {
      if (ev.target.closest("a")) setOpen(false);
    });
  }

  /* Highlight the current page in the sidebar menu */
  document.querySelectorAll(".sidebar-menu a").forEach(function (a) {
    if (a.href === location.href) a.parentElement.classList.add("active");
  });

  /* External links open in a new tab */
  document.querySelectorAll("a.external").forEach(function (a) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });

  /* Lightbox: click on content images opens a native <dialog> */
  var dlg = null;
  function openLightbox(src, alt) {
    if (!window.HTMLDialogElement) return; // very old browser: do nothing
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.className = "lightbox";
      dlg.innerHTML = "<img alt=''>";
      dlg.addEventListener("click", function () {
        dlg.close();
      });
      document.body.appendChild(dlg);
    }
    var img = dlg.querySelector("img");
    img.src = src;
    img.alt = alt || "";
    dlg.showModal();
  }
  document.addEventListener("click", function (ev) {
    var img = ev.target.closest(".content-panel img, [data-lightbox]");
    if (!img || img.closest("a") || img.closest("dialog")) return;
    var src = img.dataset.lightbox || img.currentSrc || img.src;
    if (!src) return;
    ev.preventDefault();
    openLightbox(src, img.alt);
  });
})();
