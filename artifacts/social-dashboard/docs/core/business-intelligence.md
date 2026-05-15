Configuración central de la IA para Hazpost
Documento maestro (vivo y actualizable)
________________________________________
Acuerdo de trabajo
Cómo vamos a trabajar juntos:
1.	Yo te voy diciendo las reglas y formas de aprendizaje que se te ocurran, y tu las vas agregando y redactando de manera clara.
2.	vas estar atento a cualquier mejora que funcione en otras plataformas o herramientas similares (IA para marketing, generadores de contenido, redes sociales, etc.) y si ves que algo puede servir para Hazpost y yo no lo has mencionado, me lo sugieres.
3.	Esto queda vivo → No es un documento cerrado. A medida que se me ocurran nuevas formas en que la IA pueda aprender (métricas, comportamientos, señales del usuario, etc.), simplemente te lo digo y lo actualizamos.
4.	Regla de oro: Si ves algo que se está usando en otros lados y que podría funcionar para que Hazpost sea mejor, me lo dices. Sin compromiso. Yo decido si lo agregas o no.
________________________________________
El objetivo final de Hazpost
No se trata solo de que la IA genere posts bonitos. Queremos que cada publicación tenga el mejor engagement posible, que pueda volverse viral y que el usuario realmente mejore sus resultados. Que aprenda a hacer publicidad efectiva, no solo estética.
________________________________________
Las reglas base de la IA
1. La IA toma TODO el formulario de registro y perfil de marca
La IA debe revisar y usar como base absolutamente toda la información que el usuario haya registrado:
Del formulario de registro:
•	Industria
•	Subindustria (con coincidencia exacta para aprender de otros)
•	Nichos de mercado que agregó
•	Ciudad y país
•	Tamaño del negocio
•	Público objetivo
•	Y todo lo demás registrado en ese formulario, Cualquier otro campo que el usuario complete

Del perfil de marca:
•	Nombre de la marca
•	Tono de voz (profesional, divertido, cercano, etc.)
•	Colores y estilos visuales
•	Logotipo
•	Imágenes de referencia que el usuario haya subido (para que la IA entienda el estilo visual que le gusta)
•	Sitio web si lo agregó (la IA debe revisarlo para obtener más información gráfica, textos, servicios, promociones, etc.)
•	Redes sociales vinculadas
•	Descripción del negocio
•	Valores o filosofía de la marca
•	Cualquier otro campo que el usuario complete
Importante: La IA no solo lee estos datos, sino que los usa activamente para generar contenido que sea coherente con la identidad visual y textual de la marca.
________________________________________
2. La IA genera arte visual basado en las referencias del usuario
Cuando la IA tenga que crear imágenes o artes para los posts, debe:
•	Revisar las imágenes de referencia que el usuario subió
•	Analizar el estilo, colores, composición, tipografías
•	Generar nuevos artes que sean visualmente coherentes con esas referencias
•	Respetar la identidad visual de la marca (colores, logos, estilos)
Si el usuario agregó un sitio web, la IA también lo revisa para extraer:
•	Paleta de colores
•	Estilo de las fotos
•	Tipografía que usa
•	Tipo de imágenes que promocionan
________________________________________
3. La IA aprende de los RESULTADOS reales de cada usuario
La IA analiza constantemente el rendimiento de los posts de cada usuario para mejorar sus futuras sugerencias. Esto incluye:
Métricas que la IA debe rastrear:
•	Horarios de publicación: Si el usuario publica a las 8 am pero las estadísticas muestran que a las 6 am hay más engagement, la IA le sugiere cambiar el horario.
•	Hashtags: Si cierto hashtag está funcionando mejor que otros, la IA lo sugiere más seguido.
•	Temas de post: Si un tema (ej. "tips de cuidado") tiene mejor alcance que otro, la IA le da prioridad.
•	Formatos: Si los reels funcionan mejor que las fotos, la IA aprende eso.
•	Tipos de imágenes: Si las fotos con antes/después generan más clics, la IA lo detecta.
•	Llamadas a la acción: Si "escríbenos al DM" funciona mejor que "comenta aquí", la IA lo aprende.
•	Nicho específico: Si un nicho que el usuario maneja (ej. "tintes veganos") tiene mejor respuesta, la IA le da más prioridad sobre otros nichos.
En resumen: La IA saca TODA la información que pueda de los resultados de cada usuario para optimizar continuamente.  Y todo lo que pueda usar para aprender del usuario, estadísticas y mercado etc
________________________________________
4. La IA aprende de lo que el usuario APRUEBA o RECHAZA (solo si lo evaluó)
La IA aprende del comportamiento real del usuario, pero únicamente cuando este ha revisado el contenido.
✅ Lo que la IA SÍ aprende
•	Posts que el usuario revisó y APROBÓ
La IA entiende que ese estilo, tema, formato o enfoque le funciona al usuario y debe priorizarlo en futuras propuestas. 
•	Posts que el usuario revisó y RECHAZÓ
La IA interpreta que algo no le gustó (tema, diseño, tono, formato, etc.) y comienza a identificar patrones para evitar ese tipo de contenido en el futuro. 
La IA analiza estos comportamientos en el tiempo para detectar tendencias reales del usuario.
________________________________________
❌ Lo que la IA NO aprende
•	Posts que el usuario borró sin abrir o sin revisar 
•	Acciones sin contexto claro 
Si el usuario no evaluó el contenido, la IA lo ignora completamente.
________________________________________
🧠 Memoria del usuario (user_ai_profile)
Para evitar que la experiencia empiece desde cero en cada generación, la IA mantiene una memoria activa del comportamiento del usuario.
👉 Se implementa como: user_ai_profile
Este perfil evoluciona automáticamente con el uso y permite que la IA sea cada vez más precisa y personalizada.
Incluye:
- preferencias detectadas
- lo que el usuario aprueba con mayor frecuencia
- lo que rechaza o evita
- formatos que mejor funcionan
- tono de comunicación preferido
- horarios con mejor rendimiento
- tipos de contenido con mayor engagement
- patrones propios del negocio
- señales explícitas dadas por el usuario (opcional)
________________________________________
🎯 Objetivo
Que el usuario sienta:
“La IA ya entiende mi negocio y cada vez acierta más”
________________________________________
⚠️ Reglas de la memoria
•	Es individual (no se comparte) 
•	Es evolutiva 
•	Se basa en comportamiento real, no suposiciones 
________________________________________
🧠 Feedback opcional (UX PRO)
El usuario puede dar feedback adicional de forma opcional:
¿Quieres decirnos qué no te gustó?
(opcional)
Opciones rápidas:
•	tono 
•	imagen 
•	idea 
•	muy genérico 
•	otro

5. La IA aprende de ESTACIONALIDAD y TENDENCIAS TEMPORALES
La IA debe detectar y recordar patrones relacionados con fechas, temporadas y tendencias actuales:
Estacionalidad recurrente:
•	Si cada diciembre a las peluquerías les funciona publicar "tips para lucir bien en las fiestas", la IA debe recordarlo y sugerirlo automáticamente cuando se acerque diciembre.
•	Si cada inicio de año funcionan los "propósitos de belleza", la IA lo aprende.
•	Si cada viernes cierto tipo de publicación funciona mejor, la IA lo detecta.
Tendencias actuales (en tiempo real):
•	Si un audio, formato de reel, filtro o trend se está volviendo viral en su sector, la IA debe detectarlo y sugerirlo.
•	Si hay un hashtag o tema del momento relevante para su subindustria, la IA lo propone.
Importante: La IA distingue entre tendencias pasajeras (que pueden durar días) y patrones estacionales (que se repiten cada año). Para las pasajeras, sugiere rápido pero sin insistir si el usuario las ignora.
________________________________________
6. Sin contaminación entre marcas muy importante regla clave
La IA nunca mezcla la identidad de una marca con otra. Cada usuario es dueño de su contenido y sus decisiones. La IA solo da pistas o sugerencias, nunca impone nada.
________________________________________
7. Aprendizaje por niveles, con coincidencia exacta de subindustria
La IA solo aprende de negocios que sean exactamente iguales en subindustria (ej. peluquería con peluquería, no con laboratorio clínico).
Además, si el usuario tiene nichos específicos, la IA prioriza aprender de negocios que compartan esos mismos nichos.
Y lo hace en tres niveles:
•	Nivel 1 (menos importante): Lo que funciona en otros países, misma subindustria y mismos nichos (si es posible)
•	Nivel 2 (importante): Lo que funciona en el mismo país, misma subindustria y mismos nichos
•	Nivel 3 (muy importante): Lo que funciona en la misma ciudad, misma subindustria y mismos nichos
________________________________________
Solo da pistas, nunca impone
La IA analiza lo que funciona, identifica patrones y le dice al usuario: "Esto está funcionando en negocios como el tuyo, ¿quieres probarlo?" Pero la decisión final siempre es del dueño del negocio.
________________________________________
Puede aprender cualquier patrón útil
No solo hashtags. También temas de post, formatos, horarios, tono de voz, longitud de textos, colores, tipos de imágenes, llamadas a la acción, etc. Todo lo que la IA pueda identificar como exitoso.
🔥 PRIORIDAD FINAL DEL SISTEMA (MUY IMPORTANTE)
Orden de aprendizaje:
1. Usuario (lo que le funciona a él)
2. Ciudad
3. País
4. Global

8. 🔥 CONFIANZA DEL APRENDIZAJE
La IA asigna un nivel de confianza a cada patrón basado en:
- cantidad de datos (sample size)
- consistencia en el tiempo
- nivel de engagement

9. 🔥 ANTI-RUIDO
La IA evita aprender de datos débiles.
Ejemplo:
Un post con muy baja interacción no se considera patrón.
10. 🔥 NO COPIA DE CONTENIDO
La IA nunca reutiliza:
- textos
- copies
- ideas exactas
- promociones reales
Solo aprende patrones abstractos.




1.	Regla de aprendizaje por niveles (sin contaminación entre usuarios)
Objetivo principal:
Que no haya contaminación entre usuarios (cada negocio mantiene su identidad y marca), pero que la IA aprenda de lo que funciona en la industria para mejorar el rendimiento de cada usuario.
Condición obligatoria:
La IA solo podrá aprender de un usuario y aplicar ese conocimiento a otro si existe coincidencia exacta en subindustria.
Ejemplo:
✅ Peluquería en Bogotá → puede aprender de otra Peluquería en Madrid (misma subindustria)
❌ Peluquería en Bogotá → NO puede aprender de un Laboratorio Clínico en Bogotá (diferente subindustria, aunque compartan "Salud y Belleza" como industria general)
________________________________________
¿Qué puede aprender la IA?
Cualquier patrón identificable que esté funcionando, por ejemplo:
•	Hashtags
•	Temas de post (ej. "tips de cuidado del cabello", "resultados de exámenes de sangre")
•	Formatos (reels, carruseles, historias, etc.)
•	Horarios de publicación
•	Tono de voz (inspiracional, educativo, divertido, serio, etc.)
•	Longitud de los textos
•	Estructura de llamadas a la acción
•	Tipos de imágenes o colores que funcionan
•	Palabras clave en títulos o descripciones
•	Cualquier otra métrica o patrón que la IA pueda detectar como exitoso
________________________________________
Los 3 niveles de aprendizaje (siempre dentro de la misma subindustria)
Nivel 1 (menos importante)
Aprende de lo que funciona en la misma subindustria pero en otros países.
Ejemplo: Peluquerías en Colombia aprenden de lo que funciona en peluquerías de México o España.
Nivel 2 (más importante que nivel 1)
Aprende de lo que funciona en la misma subindustria y en el mismo país, aunque sea en otra ciudad.
Ejemplo: Una peluquería en Cali puede beneficiarse de patrones que funcionan en una peluquería de Bogotá.
Nivel 3 (el más importante)
Aprende de lo que funciona en la misma subindustria y en la misma ciudad.
Ejemplo: Una peluquería en Bogotá aprende de lo que le funciona a otras peluquerías en Bogotá.
________________________________________
Regla fundamental
La IA solo identifica patrones anónimos de éxito y los ofrece como pistas o sugerencias al usuario.
La marca, los conceptos y las decisiones finales siempre pertenecen al usuario dueño del negocio.
No se mezcla información entre marcas diferentes. La IA no usa el contenido específico de un usuario (sus textos, fotos, promociones reales) para otro. Solo aprende patrones del tipo: "a las peluquerías les funciona publicar antes y después los jueves".
No hay aprendizaje cruzado entre distintas subindustrias, aunque compartan la industria general.
________________________________________
Resumen fácil
Solo peluquería aprende de peluquería.
Solo laboratorio clínico aprende de laboratorio clínico.
Primero mi ciudad, luego mi país, luego otros países.
Siempre como pistas, nunca como imposiciones.
La marca del usuario siempre es dueña de sus decisiones.


