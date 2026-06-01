"""
actualizar_imagenes.py
══════════════════════
Escanea public/assets/ y actualiza src/img_overrides.json
con las rutas de todas las imágenes encontradas.

CÓMO USAR:
  1. Agregá las fotos en public/assets/<CODIGO>/1.jpg, 2.jpg, etc.
  2. Corré este script:
       python actualizar_imagenes.py
  3. Pusheá:
       git add public/assets/ src/img_overrides.json
       git commit -m "feat: imagenes actualizadas"
       git push origin master:main
"""

import json, os, re
from pathlib import Path

ASSETS_DIR     = Path("public/assets")
OVERRIDES_PATH = Path("src/img_overrides.json")

IMG_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}


def main():
    if not ASSETS_DIR.exists():
        print("No encontre public/assets/")
        return

    # Cargar overrides existentes
    overrides = {}
    if OVERRIDES_PATH.exists():
        with open(OVERRIDES_PATH, encoding="utf-8") as f:
            overrides = json.load(f)

    updated = 0
    skipped = 0

    for folder in sorted(ASSETS_DIR.iterdir()):
        if not folder.is_dir():
            continue

        pid = folder.name

        # Buscar imagenes ordenadas
        imgs = sorted(
            [f for f in folder.iterdir() if f.suffix.lower() in IMG_EXTS],
            key=lambda f: f.name
        )

        if not imgs:
            continue

        img_paths = [f"/assets/{pid}/{f.name}" for f in imgs]

        # Si ya existe entrada, preservar videos y manual
        existing = overrides.get(pid, {})
        new_entry = {
            "images": img_paths,
            "videos": existing.get("videos", []),
            "manual": existing.get("manual", None),
        }

        if existing.get("images") == img_paths:
            skipped += 1
            continue

        overrides[pid] = new_entry
        updated += 1
        print(f"  {pid}: {len(img_paths)} imagen(es)")

    # Guardar
    with open(OVERRIDES_PATH, "w", encoding="utf-8") as f:
        json.dump(overrides, f, ensure_ascii=False, indent=2)

    print(f"\nActualizados: {updated} | Sin cambios: {skipped}")
    print(f"Guardado en {OVERRIDES_PATH}")
    if updated > 0:
        print("\nAhora pushea con:")
        print("  git add public/assets/ src/img_overrides.json")
        print('  git commit -m "feat: imagenes actualizadas"')
        print("  git push origin master:main")


if __name__ == "__main__":
    main()
