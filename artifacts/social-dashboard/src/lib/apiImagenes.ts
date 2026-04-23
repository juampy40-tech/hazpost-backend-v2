const API_URL = "https://v2.hazpost.com/api";

const API_KEY = "tu_clave_secreta_pro"; // 👈 tu API KEY de Railway

export async function getImagenes(usuario: string, tipo: string) {
  const res = await fetch(
    `${API_URL}/imagenes/listar?usuario=${usuario}&tipo=${tipo}`,
    {
      headers: {
        "x-api-key": API_KEY,
      },
    }
  );

  if (!res.ok) {
    throw new Error("Error al obtener imágenes");
  }

  return res.json();
}
