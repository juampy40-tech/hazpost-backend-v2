const API_URL = "https://v2.hazpost.com";
const API_KEY = "tu_clave_secreta_pro";

export async function getImagenes(usuario, tipo = "imagenes") {
  const res = await fetch(
    `${API_URL}/api/imagenes/listar?usuario=${encodeURIComponent(usuario)}&tipo=${encodeURIComponent(tipo)}`,
    {
      headers: {
        "x-api-key": API_KEY,
      },
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Error al listar imágenes");
  }

  return data;
}

export async function subirImagen({ usuario, tipo = "imagenes", archivo }) {
  const formData = new FormData();
  formData.append("usuario", usuario);
  formData.append("tipo", tipo);
  formData.append("archivo", archivo);

  const res = await fetch(`${API_URL}/api/imagenes/subir`, {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
    },
    body: formData,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Error al subir imagen");
  }

  return data;
}

export async function eliminarImagen({ usuario, tipo = "imagenes", nombre }) {
  const res = await fetch(
    `${API_URL}/api/imagenes/${encodeURIComponent(usuario)}/${encodeURIComponent(tipo)}/${encodeURIComponent(nombre)}`,
    {
      method: "DELETE",
      headers: {
        "x-api-key": API_KEY,
      },
    }
  );

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Error al eliminar imagen");
  }

  return data;
}