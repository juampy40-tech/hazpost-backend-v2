import json
import time
import uuid


def normalize_post_data(post_data):
    if isinstance(post_data, str):
        try:
            post_data = json.loads(post_data)
        except Exception:
            post_data = {}

    if not isinstance(post_data, dict):
        post_data = {}

    return post_data


def normalize_variants(post_data, post_id=None):
    post_data = normalize_post_data(post_data)

    variants = post_data.get("imageVariants") or post_data.get("image_variants") or []

    if not isinstance(variants, list):
        variants = []

    image_url = post_data.get("imageUrl") or post_data.get("image_url") or ""

    if not variants and image_url:
        variants = [{
            "id": post_id or str(uuid.uuid4()),
            "postId": post_id,
            "imageUrl": image_url,
            "imageData": "",
            "rawBackground": image_url,
            "rawBackgroundUrl": image_url,
            "generationStatus": "completed",
            "style": "default",
            "variantIndex": 0,
            "overlayParams": post_data.get("overlayParams") or {},
            "createdAt": int(time.time() * 1000),
        }]

    clean = []
    for index, variant in enumerate(variants):
        if not isinstance(variant, dict):
            continue

        image_url = (
            variant.get("imageUrl")
            or variant.get("image_url")
            or variant.get("imageData")
            or variant.get("rawBackground")
            or variant.get("rawBackgroundUrl")
            or ""
        )

        clean.append({
            **variant,
            "id": variant.get("id") or str(uuid.uuid4()),
            "postId": variant.get("postId") or post_id,
            "imageUrl": image_url,
            "imageData": variant.get("imageData") or "",
            "rawBackground": variant.get("rawBackground") or variant.get("rawBackgroundUrl") or image_url,
            "rawBackgroundUrl": variant.get("rawBackgroundUrl") or variant.get("rawBackground") or image_url,
            "generationStatus": variant.get("generationStatus") or "completed",
            "style": variant.get("style") or "default",
            "variantIndex": variant.get("variantIndex", index),
            "overlayParams": variant.get("overlayParams") or {},
            "createdAt": variant.get("createdAt") or int(time.time() * 1000),
        })

    clean.sort(key=lambda v: v.get("variantIndex", 0))

    post_data["imageVariants"] = clean

    if clean and not post_data.get("imageUrl"):
        post_data["imageUrl"] = clean[0].get("imageUrl") or clean[0].get("imageData")

    return clean, post_data


def find_variant(post_data, variant_id, post_id=None):
    variants, post_data = normalize_variants(post_data, post_id=post_id)

    target = str(variant_id)

    for variant in variants:
        if str(variant.get("id")) == target:
            return variant, variants, post_data

    return None, variants, post_data


def create_overlay_variant(post_data, post_id, source_variant_id=None, overlay_params=None):
    overlay_params = overlay_params or {}

    source_variant, variants, post_data = find_variant(
        post_data,
        source_variant_id or post_id,
        post_id=post_id
    )

    if not source_variant and variants:
        source_variant = variants[0]

    if not source_variant:
        raise ValueError("No hay imagen base para crear variante")

    base_image = (
        source_variant.get("rawBackgroundUrl")
        or source_variant.get("rawBackground")
        or source_variant.get("imageUrl")
        or source_variant.get("imageData")
        or post_data.get("imageUrl")
        or post_data.get("image_url")
        or ""
    )

    if not base_image:
        raise ValueError("La imagen base no tiene URL o data válida")

    next_index = len(variants)

    new_variant = {
        "id": str(uuid.uuid4()),
        "postId": post_id,
        "imageUrl": base_image,
        "imageData": "",
        "rawBackground": base_image,
        "rawBackgroundUrl": base_image,
        "generationStatus": "completed",
        "style": overlay_params.get("style") or source_variant.get("style") or "default",
        "variantIndex": next_index,
        "overlayParams": {
            **(source_variant.get("overlayParams") or {}),
            **overlay_params,
        },
        "createdAt": int(time.time() * 1000),
        "sourceVariantId": source_variant.get("id"),
        "isOverlayVariant": True,
        "needsRender": True,
    }

    variants.append(new_variant)

    post_data["imageVariants"] = variants
    post_data["selectedImageVariant"] = new_variant["id"]

    # Por ahora apunta a la nueva variante. Luego aquí irá la composición real.
    post_data["imageUrl"] = new_variant["imageUrl"]

    return new_variant, post_data


def select_variant(post_data, variant_id, post_id=None):
    variant, variants, post_data = find_variant(post_data, variant_id, post_id=post_id)

    if not variant:
        raise ValueError("Variante no encontrada")

    post_data["selectedImageVariant"] = variant.get("id")
    post_data["imageUrl"] = variant.get("imageUrl") or variant.get("imageData") or post_data.get("imageUrl")

    return variant, post_data


def delete_variant(post_data, variant_id, post_id=None):
    variants, post_data = normalize_variants(post_data, post_id=post_id)

    target = str(variant_id)
    remaining = [v for v in variants if str(v.get("id")) != target]

    if len(remaining) == len(variants):
        raise ValueError("Variante no encontrada")

    for index, variant in enumerate(remaining):
        variant["variantIndex"] = index

    post_data["imageVariants"] = remaining

    if str(post_data.get("selectedImageVariant")) == target:
        post_data["selectedImageVariant"] = remaining[0].get("id") if remaining else None
        post_data["imageUrl"] = remaining[0].get("imageUrl") if remaining else post_data.get("imageUrl")

    return post_data


def reorder_variants(post_data, variant_ids, post_id=None):
    variants, post_data = normalize_variants(post_data, post_id=post_id)

    order_map = {str(vid): index for index, vid in enumerate(variant_ids)}

    for variant in variants:
        if str(variant.get("id")) in order_map:
            variant["variantIndex"] = order_map[str(variant.get("id"))]

    variants.sort(key=lambda v: v.get("variantIndex", 0))
    post_data["imageVariants"] = variants

    return variants, post_data
