import { useEffect, useState } from "react";

export default function ImagenesTest() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      try {
        const res = await fetch(
          "https://v2.hazpost.com/api/imagenes/listar?usuario=test&tipo=imagenes",
          {
            headers: {
              "x-api-key": "tu_clave_secreta_pro",
            },
          }
        );

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json?.error || "Error API");
        }

        setData(json);
        console.log("OK:", json);
      } catch (err: any) {
        setError(err.message);
        console.error(err);
      }
    }

    cargar();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Prueba API Imágenes</h1>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {data && (
        <div>
          <p><b>Usuario:</b> {data.usuario}</p>
          <p><b>Tipo:</b> {data.tipo}</p>
          <p><b>Archivos:</b> {data.archivos?.length ?? 0}</p>
        </div>
      )}

      {!data && !error && <p>Cargando...</p>}
    </div>
  );
}
