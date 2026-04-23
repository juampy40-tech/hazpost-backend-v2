import { useEffect } from "react";
import { getImagenes } from "../lib/apiImagenes";

export default function PruebaImagenes() {
  useEffect(() => {
    async function cargar() {
      try {
        const data = await getImagenes("test", "imagenes");
        console.log("Listado:", data);
      } catch (error: any) {
        console.error("Error:", error.message);
      }
    }

    cargar();
  }, []);

  return <div>Probando imágenes... abre consola (F12)</div>;
}
