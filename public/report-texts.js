// Capa de interpretación del informe (Fase 1).
//
// Todo el texto es plantilla fija: se elige según los resultados reales del
// motor (score por dimensión, puntos por criterio). No hay IA redactando, no se
// cambia ningún score y no se inventa evidencia. Cada criterio técnico del motor
// (sub_criteria) tiene aquí su traducción humana; el identificador técnico se
// sigue mostrando en la sección "Evidencia técnica".
//
// Umbrales de interpretación por dimensión (mismas bandas que el score global):
//   full  = score 100 sin gaps
//   high  = 76–99   ("operable" en esa capacidad, con gaps menores)
//   mid   = 51–75
//   low   = 0–50
(function () {
  const es = {
    ui: {
      question: "¿Qué tan preparado está este Design System para trabajar con agentes?",
      scoreNote:
        "El puntaje mide qué tan preparado está el sistema para que un agente lo descubra, lo entienda y lo use sin intervención humana. No es una medida de la calidad del Design System para personas.",
      gate:
        "El acceso (D1) es muy bajo, así que el resultado general queda limitado a un máximo de 40, sin importar las demás dimensiones: si un agente no puede llegar a la información, lo demás no se puede aprovechar.",
      liveCaveat:
        "Algunas partes del sistema no se pudieron leer desde el sitio (ver «Limitaciones»), así que este resultado podría subestimar al Design System.",
      canDo: "Puede hacer bien",
      mayInfer: "Todavía puede necesitar inferir",
      cannot: "Todavía no puede hacerlo de forma confiable",
      notEvaluated: "No se pudo evaluar",
      therefore: "Por tanto:",
      expected: "Se esperaba encontrar:",
      chainTitle: "Las capacidades que necesita un agente",
      chainLead: "Cada dimensión mide una capacidad que un agente necesita para trabajar de forma autónoma. Van de la más básica a la más avanzada.",
      dimsTitle: "Las dimensiones, explicadas",
      aboutDim: "Sobre esta dimensión",
      inThisDs: "En este Design System",
      qWhat: "¿Qué estamos evaluando?",
      qPurpose: "¿Para qué sirve?",
      qWhy: "¿Por qué importa para un agente?",
      qFound: "¿Qué encontramos?",
      qMeaning: "¿Qué significa para el agente?",
      qImprove: "¿Qué debería mejorar el equipo?",
      tagEvidence: "Evidencia",
      tagInference: "Interpretación",
      tagReco: "Recomendación",
      tagLimit: "Limitación",
      result: "Resultado",
      capability: "Capacidad agentic evaluada",
      notScored: "Sin puntaje",
      evidenceTitle: "Evidencia técnica",
      evCrit: "Criterio técnico",
      evMeaning: "Qué mide",
      evPoints: "Puntos",
      evStatus: "Estado",
      stFound: "Encontrado",
      stPartial: "Gap parcial",
      stGap: "Gap",
      stNA: "No aplica",
      stNotEval: "No evaluable",
      engineFindings: "Hallazgos del motor para esta dimensión (texto original)",
      engineLangNote: "",
      coverage: "Cobertura",
      covComponents: "componentes detectados",
      covScored: "componentes evaluados",
      covWithProps: "con propiedades encontradas",
      covPatterns: "patrones detectados",
      foundIntro: "El sistema documenta correctamente:",
      gapsIntroOne: "Encontramos un gap:",
      gapsIntroMany: "Encontramos {n} gaps:",
      noGaps: "No se detectaron gaps en esta dimensión.",
      noneFound: "No se encontró evidencia a favor en ninguno de los criterios de esta dimensión.",
      naIntro: "No aplica en este sistema:",
      excludedIntro: "No se pudo determinar (no cuenta a favor ni en contra):",
      noActions: "No se identifican acciones pendientes en esta dimensión.",
      dimNotEvaluable:
        "No se pudo evaluar esta dimensión: en lo que se revisó no hubo información suficiente para determinar un resultado. Esto no significa que falte en el Design System, sino que no se pudo verificar.",
      dimNotEvaluableMeaning: "Sin evidencia, no es posible anticipar cómo se comportaría el agente en esta capacidad.",
      dimNotEvaluableImprove:
        "Asegurar que esta información esté publicada en un lugar al que un agente pueda llegar (por ejemplo, páginas públicas enlazadas desde la documentación) y volver a evaluar.",
      d7Pending: "Todavía no se evalúa en esta fase.",
      limitationsTitle: "Limitaciones de esta evaluación",
      limDemo:
        "Este es un resultado de demostración: se calculó con el motor real, sobre un ejemplo guardado, no sobre un sitio real.",
      limLive: "Resultado en vivo: se revisaron las páginas públicas del sitio en este momento.",
      limDocsOnly:
        "Esta evaluación analiza lo que el Design System publica; no pone a un agente a trabajar con él. Comprobar el comportamiento real de un agente corresponde a la Fase 2.",
      limFailed: "{n} página(s) del sitio no se pudieron abrir.",
      limLimited: "La revisión alcanzó su límite de páginas antes de recorrer todo el sitio.",
      limNotEval: "No se pudieron evaluar: {list}.",
      limD3Live:
        "No se encontraron propiedades ni variantes de componentes en las páginas revisadas. Esta versión del evaluador todavía no lee tablas de propiedades ni listas de variantes desde páginas web, ni documentación alojada en otros sitios (por ejemplo, Storybook), así que D3 puede estar subestimada.",
      noBasisApi:
        "no se encontraron propiedades para comparar entre componentes. El motor lo cuenta como 0 en el puntaje, pero eso no indica que la API sea inconsistente.",
      stNone: "sin evidencia",
      meaningCaveat: "Con la información que se pudo leer:",
      // ---- certeza de la evidencia ----
      certDemonstrated: "Encontrado",
      certPartial: "Encontrado en parte",
      certNotDemonstrated: "No encontrado",
      certAbsent: "No existe",
      certNotEvaluated: "No se pudo leer",
      certNA: "No aplica",
      certHelp:
        "Encontrado: se buscó y está. No encontrado: se buscó en lo que se leyó y no apareció; podría estar en otra parte. No existe: hay certeza de que falta. No se pudo leer: el evaluador no pudo buscarlo; queda fuera de la nota.",
      rsObservable: "se buscó en las páginas leídas y no se encontró en un formato que el evaluador reconozca",
      rsLinked: "el evaluador solo lo detecta si está publicado y enlazado desde las páginas revisadas",
      rsIncomplete: "la evidencia recuperada está incompleta",
      rsUnreadable: "la forma en que está publicado no permite leerlo desde páginas web; queda fuera de la nota",
      rsExternal: "está en una fuente oficial del sistema (Storybook, repositorio o paquete) que esta versión todavía no lee; queda fuera de la nota",
      rsNotLooked: "no se leyó el lugar donde suele estar; queda fuera de la nota",
      rsNotRead: "el sistema lo publica, pero esas páginas no entraron en la muestra; queda fuera de la nota",
      rsProbed: "se buscó en su dirección estándar y no está",
      rsExcluded: "no hubo información suficiente para evaluarlo; no cuenta en el puntaje",
      incompleteBadge: "Evaluación incompleta",
      completeBadge: "Evidencia completa",
      incompleteLead: "El resultado está limitado por:",
      incompleteReading:
        "Por eso, el puntaje debe leerse como el nivel de preparación demostrado con la evidencia recuperada, no como una medición definitiva de todo el Design System.",
      rLimited: "el rastreo alcanzó su límite de páginas, profundidad o tiempo antes de completarse",
      rFailed: "{n} página(s) no se pudieron recuperar",
      rGate: "el acceso mecánico (D1) fue bajo, y eso limita el resultado general a un máximo de 40",
      rUnreadable: "parte del contenido está publicado de una forma que no se puede leer desde páginas web",
      rExternal: "parte de la información está en fuentes oficiales del sistema (Storybook, repositorio o paquetes) que esta versión todavía no lee",
      rNotLooked: "algunos lugares donde suele estar la información no se llegaron a leer",
      rLowCoverage: "solo se pudo revisar el {pct} % de lo que compone la nota; por eso no se asigna nivel",
      rNotEval: "{list} no se pudieron evaluar",
      dimIncomplete: "Evidencia incompleta",
      dimComplete: "Evidencia completa",
      scoreDemonstrated: "demostrado",
      noBandChip: "Sin nivel: se revisó menos de la mitad",
      downloadGroup: "Descargar el resultado",
      downloadPdf: "Descargar PDF",
      downloadJson: "Descargar datos (JSON)",
      downloadNote:
        "No guardamos tu resultado: si cerrás esta pestaña, se pierde. Para conservarlo, descargalo; el archivo se genera en tu navegador. Para el PDF, elegí «Guardar como PDF» en la ventana que se abre.",
      printHead: "Informe de preparación de un Design System para agentes de IA",
      evaluatedAt: "Evaluado el {date}",
      printFooter:
        "Generado con Agentic DS (Fase 1). El resultado refleja la evidencia que se pudo recuperar en la fecha de la evaluación; no es una certificación ni una medición definitiva del Design System.",
      sourcesTitle: "Qué revisamos",
      sourcesJump: "Ver qué revisamos ({n} leídas)",
      sourcesLead: "Empezamos por {url}. Esta es la lista de lo que el evaluador intentó leer y qué pasó con cada cosa.",
      sourcesSummary: "Leídas: {read}. No se pudieron abrir: {failed}. Sin leer por los límites de la evaluación: {skipped}. Fuera del alcance: {out}.",
      usedTabUnused: "otra pestaña de «{name}»",
      usedPattern: "leída como patrón «{name}»",
      sourcesDemo: "Es un resultado de demostración: no se leyó ningún sitio real.",
      sourcesUnavailable: "Este resultado no incluye la lista de lo revisado. Volvé a evaluar la dirección para verla.",
      sourcesMore: "Y {n} más que no se muestran.",
      sourcesNotYet:
        "El evaluador busca llms.txt y sitemap.xml, usa el menú si no los encuentra y lee una muestra ordenada del sistema. Todavía no lee Storybook, el repositorio de código ni los paquetes publicados: solo los anota si la documentación los enlaza.",
      srcRead: "Leídas",
      srcReadHelp: "Al lado de cada una, para qué la usó el evaluador.",
      srcNotPresent: "Buscamos y no estaban",
      srcNotPresentHelp: "Archivos que el evaluador busca en direcciones conocidas. Que falten no es un error del sitio.",
      srcFailed: "No se pudieron abrir",
      srcSkipped: "Encontradas pero no leídas",
      srcSkippedHelp: "Links que el evaluador encontró pero no llegó a leer por los límites de páginas, tiempo o profundidad. No se usaron en la nota.",
      srcOutOfScope: "Fuera del alcance",
      srcOutOfScopeHelp: "Links a otros sitios o a secciones que no parecen parte del Design System. Por ahora no se siguen.",
      srcDuplicate: "Repetidas",
      srcDuplicateHelp: "Direcciones que llevaban a una página ya leída. No se leyeron dos veces.",
      roleEntry: "dirección pegada",
      roleRoot: "inicio del Design System",
      roleOfficial: "fuente oficial (todavía no se lee)",
      roleListed: "de la lista del sitio",
      roleWellKnown: "archivo conocido",
      usedComponent: "leída como componente «{name}»",
      usedTokens: "archivo de tokens (tokens leídos: {n})",
      usedManifest: "índice para agentes ({name})",
      usedSchema: "definición de tipos",
      usedNothing: "leída; no se reconoció como componente, tokens ni índice",
      srHttp404: "no existe (error 404)",
      srHttpRefused: "el sitio rechazó la visita automática (error {n})",
      srHttpServer: "error del sitio (error {n})",
      srHttpOther: "el sitio respondió con error {n}",
      sourceReasons: {
        OUTSIDE_SCOPE: "otro sitio o una sección que no parece del Design System",
        QUERY_VARIANT_LIMIT: "variante de una página ya incluida (solo cambia un parámetro)",
        TIME_LIMIT: "se alcanzó el tiempo máximo de la evaluación",
        PAGE_LIMIT: "se alcanzó el máximo de páginas",
        DEPTH_LIMIT: "demasiado lejos de la página de inicio",
        ALREADY_READ: "ya se había leído con otra dirección",
        REDIRECTED_OUTSIDE: "redirige a otro sitio",
        HTML_FALLBACK: "el sitio devolvió una página común en lugar del archivo",
        EMPTY: "el archivo está vacío",
        TIMEOUT: "tardó demasiado en responder",
        NETWORK_ERROR: "error de conexión",
        BLOCKED: "dirección interna bloqueada por seguridad",
        TOO_LARGE: "demasiado grande (más de 5 MB)",
        TOO_MANY_REDIRECTS: "demasiadas redirecciones",
        NOT_PROCESSED: "no se llegó a procesar",
        NOT_IN_SAMPLE: "está en la lista del sitio, pero no entró en la muestra",
        EXTERNAL_NOT_READ_YET: "enlazada desde la documentación; esta versión todavía no la lee",
        NOT_A_SITEMAP: "la dirección existe, pero no es un sitemap",
      },
      limNotEvaluableNow:
        "Qué todavía no se puede leer: contenido que solo aparece al ejecutar JavaScript, páginas con login, archivos de Figma y documentación publicada en otros sitios (por ejemplo, Storybook o el repositorio). Eso se marca como «no se pudo leer» y queda fuera de la nota. Si lo que se pudo revisar es menos de la mitad de la nota, no se asigna nivel.",
      limExternal: "Parte de la información está en fuentes oficiales del sistema (Storybook, repositorio o paquetes) que esta versión todavía no lee. Esos criterios quedaron fuera de la nota.",
      limNotLooked: "Algunos lugares donde suele estar la información (patrones, tokens) no se llegaron a leer. Esos criterios quedaron fuera de la nota.",
      discStart: "empezamos por {url}",
      discRoot: "reconocimos el Design System en {url}",
      discFound: "encontramos {n} componentes y evaluamos {m}",
      discSampledOnly: "evaluamos {m} componentes",
      discMethod: {
        "llms.txt": "La lista de páginas salió de su llms.txt.",
        sitemap: "La lista de páginas salió de su sitemap.xml.",
        navigation: "La lista de páginas salió de su menú de navegación.",
        links: "No encontramos una lista de páginas, así que seguimos los enlaces desde la dirección pegada.",
      },
      discOfficial: "La documentación enlaza estas fuentes oficiales (todavía no se leen): {list}.",
      officialKind: { storybook: "Storybook", repository: "repositorio de código", package: "paquete publicado" },
      provisionalLead:
        "Solo se pudo revisar el {pct} % de lo que compone la nota. Con menos de la mitad no asignamos nivel: el número refleja lo revisado, pero no alcanza para una conclusión.",
      provisionalSummary:
        "Esta nota refleja solo lo que el evaluador pudo leer. Abajo se ve qué capacidades quedaron demostradas y cuáles no se pudieron evaluar.",
      dimUnreadable: "No se pudo leer",
      dimUnreadableNote: "",
      notDemonstratedList: "No se pudo demostrar",
      notDemonstratedCap: "La capacidad «{verb}» queda no demostrada, no necesariamente ausente.",
      meaningIncomplete: "Con la evidencia recuperada:",
      grpDemonstrated: "Encontrado. El sistema documenta:",
      grpNotDemonstrated: "No encontrado (se buscó y no apareció; puede estar en otra parte):",
      grpAbsent: "No existe:",
      grpNotEvaluated: "No se pudo leer (fuera de la nota):",
      grpNA: "No aplica en este sistema:",
      partialMark: "en parte",
      recoLimits: "Limitación de la evaluación, no del Design System:",
      recoLimitsTail: "Esto no es una recomendación para el equipo: primero hay que poder evaluarlo.",
      recoDirect: "Gaps del Design System:",
      recoPossible: "Posibles gaps (verificar antes de actuar). Si esto realmente no existe en el sistema:",
      recoNoneFirm: "Con la evidencia disponible no hay recomendaciones firmes para esta dimensión.",
      d2NotFoundLive:
        "No se encontraron tokens en las páginas de fundamentos que se leyeron, ni como tabla ni como archivo.",
      d2NotFoundDemo: "La evidencia analizada no incluye tokens estructurados.",
      d2FixPossible: "Publicar los tokens en un archivo JSON (idealmente en formato W3C DTCG) y enlazarlo desde la documentación.",
      emptyDimNote: "El motor no detalló criterios para esta dimensión.",
      dimPartialLead: "Esta dimensión solo pudo evaluarse en parte: de {total} criterios, {dem} quedaron demostrados, {nd} no se pudieron demostrar y {ne} no se pudieron evaluar.",
      engineFindingsIncomplete: "Con evidencia incompleta, las frases de ausencia («no se detectaron…») deben leerse como «no encontrado», no como «no existe».",
      stPartialShort: "parcial",
      limD5Live:
        "No se encontraron patrones ni reglas de composición en un formato que el evaluador pueda leer. Si el sistema los documenta, D5 puede estar subestimada.",
      limD7: "D7 (Consistencia Design–Code) no se evaluó: requiere conexión a Figma.",
      d3LiveImprove:
        "Primero, comprobar si las propiedades y variantes ya están documentadas en otro lugar (por ejemplo, Storybook o una tabla de props): esta versión del evaluador todavía no puede leerlas desde la web. Si realmente faltan:",
      d5LiveImprove:
        "Primero, comprobar si el sistema ya documenta patrones en un formato que el evaluador todavía no lee. Si realmente faltan:",
      bandLabel: { Opaco: "Opaco", Legible: "Legible", Interpretable: "Interpretable", Operable: "Operable" },
      bandRange: { Opaco: "0–25", Legible: "26–50", Interpretable: "51–75", Operable: "76–100" },
      modeDemo: "Resultado de demostración",
      modeLive: "Resultado en vivo",
      noResult: "No hay suficiente evidencia para dar un resultado general.",
      noResultD1:
        "No se pudo acceder a la documentación desde esa dirección, así que no es posible dar un resultado honesto. Probar con la página de un componente concreto (por ejemplo, la del botón) y comprobar que el sitio sea público.",
      noResultCoverage:
        "Se pudo revisar muy poco del sistema desde esa dirección para dar un resultado honesto. Probar con la página de un componente concreto (por ejemplo, la del botón).",
    },

    bands: {
      Operable: {
        summary:
          "Este Design System está altamente preparado para que un agente pueda descubrir, interpretar y reutilizar gran parte del sistema de manera autónoma.",
        conclusion:
          "El sistema es operable para agentes, pero todavía existen puntos donde el agente debe inferir decisiones que idealmente deberían estar expresadas explícitamente por el Design System.",
        conclusionNoGaps:
          "El sistema es operable para agentes: no se detectaron puntos donde el agente deba inferir decisiones importantes.",
      },
      Interpretable: {
        summary:
          "Un agente puede entender buena parte de este Design System, pero en varios puntos tendrá que inferir decisiones que el sistema no expresa de forma explícita.",
        conclusion:
          "El sistema es interpretable para agentes: un agente puede trabajar con él, pero su autonomía queda limitada por todo lo que todavía tiene que inferir.",
      },
      Legible: {
        summary:
          "Un agente puede leer parte de la documentación de este Design System, pero le falta información estructurada para utilizarlo sin adivinar.",
        conclusion:
          "El sistema es legible para agentes, pero todavía no utilizable de forma autónoma: muchas decisiones quedarían en manos del agente.",
      },
      Opaco: {
        summary: "Hoy un agente casi no puede acceder a este Design System ni interpretarlo por su cuenta.",
        conclusion:
          "El sistema es opaco para agentes: antes de pensar en autonomía, el primer paso es que el agente pueda llegar a la información.",
      },
    },

    dims: {
      D1: {
        name: "Acceso",
        verb: "Descubrir",
        can: "descubrir y recuperar la información del sistema",
        what:
          "Si un agente puede encontrar y recuperar de manera mecánica la información que necesita para trabajar con el Design System: documentación, catálogo de componentes, propiedades y tipos, tokens e información estructurada.",
        purpose:
          "Un Design System puede tener excelente documentación y componentes perfectamente definidos, pero si esa información no es accesible para un agente, en la práctica el agente no puede utilizarla.",
        why:
          "Es la primera capacidad: descubrir. Antes de poder interpretar o utilizar un Design System, el agente tiene que poder llegar hasta él. Por eso, si el acceso es muy bajo, el resultado general queda limitado sin importar el resto.",
        meaning: {
          full: "El agente tiene una base adecuada para empezar a trabajar con el Design System sin depender de una persona que le indique dónde encontrar la información.",
          high: "El agente puede llegar a la mayor parte de la información por su cuenta, aunque algunas piezas no estarán en un formato que pueda recuperar directamente.",
          mid: "El agente puede llegar a parte de la información, pero otras piezas importantes no están en un formato que pueda recuperar por sí solo. Dependerá más de lo que alguien le indique.",
          low: "El agente tiene serias dificultades para llegar a la información del sistema. Sin acceso, las demás capacidades casi no pueden aprovecharse.",
        },
      },
      D2: {
        name: "Tokens",
        verb: "Reutilizar",
        can: "reutilizar las decisiones visuales del sistema (tokens)",
        what:
          "Si un agente puede identificar y reutilizar los valores visuales definidos por el Design System: color, espaciado, tipografía, tamaños, etc.",
        purpose:
          "Los tokens permiten que las decisiones visuales del sistema estén expresadas de forma reutilizable y no dependan de valores inventados en cada interfaz.",
        why:
          "Un agente puede generar una interfaz visualmente plausible usando valores arbitrarios, y eso no significa que esté usando el Design System. Para trabajar de forma agentic, el agente debe poder reconocer: «el sistema ya tomó esta decisión; debo reutilizarla».",
        meaning: {
          full: "El agente puede reutilizar los valores del sistema y entender qué representa cada uno, en lugar de inventarlos.",
          high: "El agente puede reutilizar los valores existentes, pero algunas decisiones todavía requieren inferencia, por ejemplo cuando hay varias opciones posibles para un mismo uso.",
          mid: "El agente encuentra parte de los valores del sistema, pero en muchos casos tendrá que elegir sin saber cuál corresponde, o aproximar valores.",
          low: "El agente no encuentra los valores del sistema en un formato que pueda reutilizar. Lo más probable es que genere valores parecidos, pero no los del sistema.",
        },
      },
      D3: {
        name: "Componentes y API",
        verb: "Utilizar",
        can: "utilizar correctamente los componentes existentes",
        what:
          "Si el Design System proporciona suficiente información para que un agente entienda y use correctamente sus componentes. No basta con encontrar un componente como Button: el agente debe entender qué propiedades tiene, qué valores acepta, qué variantes y estados existen, cuáles son sus valores por defecto y para qué sirve cada propiedad.",
        purpose:
          "Sirve para determinar si los componentes son realmente utilizables por un sistema que trabaja de forma autónoma. Una persona puede preguntarle a otro diseñador «¿qué variante debería usar aquí?»; un agente no necesariamente tiene esa posibilidad. La información tiene que estar en el propio sistema.",
        why:
          "Un agente puede generar código sintácticamente válido sin usar correctamente el Design System. Si la API está incompleta o es ambigua, puede inventar valores, usar propiedades inexistentes, combinar variantes de forma incorrecta, ignorar estados o interpretar de manera diferente componentes parecidos.",
        meaning: {
          full: "El agente tiene la información necesaria para usar los componentes sin tener que adivinar cómo funcionan.",
          high: "El agente tiene suficiente información para usar gran parte de los componentes correctamente. En algunos casos tendrá que inferir, y el riesgo no es que no pueda usarlos, sino que produzca una implementación aparentemente correcta que use la API de una manera que el sistema no contempla.",
          mid: "El agente puede usar los componentes, pero con frecuencia tendrá que adivinar propiedades, valores o estados. Es probable que produzca implementaciones que funcionan pero no respetan el sistema.",
          low: "El agente no encuentra cómo se configuran los componentes. Podrá nombrarlos, pero tendrá que adivinar casi todo sobre su uso.",
        },
      },
      D4: {
        name: "Semántica",
        verb: "Decidir",
        can: "elegir el componente adecuado para cada situación",
        what:
          "Si el Design System explica para qué sirve cada componente, cuándo usarlo, cuándo no, qué no se debe hacer y cómo elegir entre componentes parecidos.",
        purpose:
          "La API dice cómo se usa un componente; la semántica dice cuándo corresponde usarlo. Es la diferencia entre un catálogo de piezas y un sistema con criterio.",
        why:
          "Sin criterios explícitos, un agente elige entre componentes técnicamente válidos sin fundamento: un modal donde correspondía una notificación, un checkbox donde iba un switch. El resultado funciona, pero no es la decisión que el sistema habría tomado.",
        meaning: {
          full: "El agente encuentra criterios explícitos para decidir qué componente usar, cuándo no usarlo y qué evitar.",
          high: "El agente encuentra criterios para la mayoría de las decisiones, pero en algunos casos tendrá que decidir por su cuenta lo que el sistema no explica.",
          mid: "El agente puede identificar para qué sirven varios componentes, pero muchas decisiones de uso quedarán a su criterio.",
          low: "El agente no encuentra criterios para decidir cuándo usar cada componente. Elegirá por parecido, no por intención de diseño.",
        },
      },
      D5: {
        name: "Patrones",
        verb: "Componer",
        can: "combinar componentes siguiendo las reglas del sistema",
        what:
          "Si el Design System documenta cómo se combinan los componentes: patrones (formularios, tablas, páginas), reglas de composición, qué puede ir dentro de qué, y la distribución y los espacios entre elementos.",
        purpose:
          "Las pantallas reales no se construyen con un componente aislado. Los patrones capturan decisiones que el equipo ya tomó sobre cómo se arman las cosas.",
        why:
          "Un agente que sabe usar cada componente por separado puede, igualmente, armar pantallas incoherentes. Para componer de forma autónoma necesita reglas explícitas de combinación.",
        meaning: {
          full: "El agente puede componer pantallas siguiendo patrones y reglas documentadas por el sistema.",
          high: "El agente puede seguir los patrones del sistema en la mayoría de los casos, pero algunas combinaciones tendrá que inferirlas.",
          mid: "El agente encuentra algunos patrones, pero muchas decisiones de composición quedarán a su criterio.",
          low: "El agente no encuentra patrones ni reglas de composición. Armará las pantallas por intuición, no siguiendo el sistema.",
        },
      },
      D6: {
        name: "Documentación",
        verb: "Resolver",
        can: "obtener contexto y ejemplos para resolver dudas",
        what:
          "Si hay suficiente documentación recuperable —descripciones, ejemplos de código, explicación de variantes y estados, accesibilidad y versiones— para que un agente tenga contexto al tomar decisiones.",
        purpose:
          "La documentación es el contexto que acompaña a las piezas: explica, muestra ejemplos y ayuda a resolver casos que la API no cubre por sí sola.",
        why:
          "Cuando algo no está claro, una persona pregunta o busca un ejemplo. Un agente solo cuenta con lo que el sistema publica. Sin ejemplos ni explicaciones, resuelve las dudas adivinando.",
        meaning: {
          full: "El agente cuenta con contexto y ejemplos suficientes para resolver dudas sin intervención humana.",
          high: "El agente cuenta con buen contexto para la mayoría de los casos, pero algunas dudas no encontrarán respuesta en la documentación.",
          mid: "El agente encuentra contexto para parte del sistema, pero muchas dudas quedarán sin ejemplos ni explicaciones en los que apoyarse.",
          low: "El agente casi no encuentra contexto ni ejemplos. Resolverá la mayoría de las dudas por su cuenta.",
        },
      },
      D7: {
        name: "Consistencia Design–Code",
        verb: "Verificar",
        can: "verificar que diseño y código representan el mismo sistema",
        what:
          "Si lo que está en el diseño (Figma) y lo que está en el código representan realmente el mismo sistema: los mismos componentes, variantes y valores.",
        purpose:
          "Cuando diseño y código se separan, en la práctica hay dos versiones del sistema y ninguna es completamente confiable.",
        why:
          "Un agente que trabaja desde el diseño o desde el código necesita poder confiar en que ambos coinciden. Si no coinciden, reproduce la inconsistencia.",
        notEvaluated:
          "Esta dimensión todavía no se evalúa: requiere conectar el archivo de Figma del Design System.",
      },
    },

    // name: nombre humano del criterio · found: cómo se enumera cuando está cumplido
    // gap: qué no se encontró (sin afirmar más de lo evaluado) · infer: qué tendría
    // que inferir el agente · fix: acción concreta para el equipo
    subs: {
      documentation_recoverability: { name: "Documentación recuperable", found: "que el contenido de las páginas de documentación esté presente en el HTML que devuelve el servidor (no que aparezca recién después de ejecutar JavaScript), y que las páginas respondan sin error", gap: "Parte de las páginas de documentación no se pudieron recuperar.", infer: "partes de la documentación a las que no pudo llegar", fix: "Asegurar que las páginas de documentación sean públicas, carguen sin errores y tengan su contenido en el HTML (no solo después de ejecutar JavaScript)." },
      component_index: { name: "Índice de componentes", found: "un índice de componentes (por ejemplo index.json o stories.json) que liste el nombre y la ruta de cada componente, en un formato legible por máquinas como JSON — no solo enlaces dentro de páginas HTML", gap: "No se encontró un índice de componentes legible por máquinas (por ejemplo, un index.json).", infer: "qué componentes existen en el sistema", fix: "Publicar un índice con todos los componentes en un archivo estructurado (por ejemplo, el index.json que genera Storybook)." },
      props_types_accessibility: { name: "Propiedades y tipos accesibles", found: "las propiedades de cada componente (nombre, tipo y valores permitidos) publicadas en un formato estructurado como JSON o TypeScript, no solo descritas en prosa", gap: "No se encontraron las propiedades y tipos de los componentes en un formato estructurado que un agente pueda recuperar.", infer: "qué propiedades y tipos tiene cada componente", fix: "Publicar las propiedades de cada componente, con sus tipos y valores, en un formato estructurado, no solo en texto o imágenes." },
      structured_tokens: { name: "Tokens estructurados", found: "un archivo de tokens en formato de datos (JSON, idealmente siguiendo el estándar W3C Design Tokens) con los valores de color, espaciado, tipografía, etc., no solo variables CSS sueltas", gap: "No se encontraron tokens en un archivo estructurado que un agente pueda descargar.", infer: "dónde están los valores visuales del sistema", fix: "Publicar los tokens en un archivo JSON enlazado desde la documentación." },
      types_or_schema: { name: "Tipos o esquema", found: "un archivo de definiciones de tipos (.d.ts) o un JSON Schema que describa exactamente qué props acepta cada componente y de qué tipo son", gap: "No se encontraron tipos ni esquema del código (por ejemplo, archivos .d.ts o JSON Schema).", infer: "la estructura exacta de las APIs", fix: "Publicar los tipos de los componentes (archivos .d.ts o un JSON Schema) en un lugar accesible." },
      agent_manifest: { name: "Manifiesto para agentes", found: "un archivo llms.txt o AGENTS.md en la raíz del sitio, en texto plano, que indique qué hay en el sistema y por dónde empezar a recorrerlo", gap: "No se encontró un manifiesto para agentes (llms.txt o AGENTS.md).", infer: "por dónde empezar a recorrer el sistema", fix: "Agregar un archivo llms.txt en la raíz del sitio: un índice breve, en texto, que le indica a un agente dónde está cada cosa." },
      agent_interface: { name: "Interfaz para agentes", found: "un servidor MCP u otra API que un agente pueda consultar directamente, sin tener que leer e interpretar páginas HTML", gap: "No se encontró una interfaz directa para agentes (por ejemplo, un servidor MCP).", infer: "cómo consultar el sistema sin recorrer páginas web", fix: "Ofrecer un servidor MCP u otra interfaz para que los agentes consulten el sistema directamente." },

      tokens_identifiable: { name: "Tokens identificables", found: "al menos un archivo o sección donde los valores visuales (colores, espaciados, etc.) tengan un nombre propio, no solo números sueltos dentro del CSS", gap: "No se encontraron tokens identificables.", infer: "qué valores visuales define el sistema", fix: "Expresar las decisiones visuales como tokens con nombre, no como valores sueltos." },
      structured_format: { name: "Formato estructurado", found: "los tokens exportados como datos (JSON o YAML), no solo como variables CSS o Sass", gap: "Los tokens no están en un formato estructurado.", infer: "cómo leer los tokens", fix: "Exportar los tokens en un formato estándar, idealmente W3C Design Tokens (DTCG)." },
      naming_consistency: { name: "Consistencia de nombres", found: "que todos los tokens sigan el mismo patrón de nombres (por ejemplo, siempre categoría-propiedad-variante), en vez de mezclar varios estilos", gap: "Los nombres de los tokens no siguen una única convención.", infer: "cómo se llaman los tokens que no vio", fix: "Unificar la convención de nombres de todos los tokens." },
      primitive_to_semantic: { name: "Relación base → semántico", found: "tokens con nombre de intención (por ejemplo color-action-primary) que referencian a un token base (por ejemplo blue-600), en vez de que los componentes usen el valor base directamente", gap: "No se encontró, o se encontró solo en parte, la relación entre tokens base y tokens con significado.", infer: "qué token corresponde a cada uso", fix: "Separar tokens base (por ejemplo, blue-600) de tokens con significado (por ejemplo, color-action-primary), y hacer que los segundos apunten a los primeros." },
      color_coverage: { name: "Color", found: "tokens de color con nombre de uso (por ejemplo color-text-primary, color-border-error), no solo una paleta de colores sin asignar", gap: "No se encontraron tokens de color.", infer: "los colores del sistema", fix: "Incluir los colores como tokens." },
      spacing_sizing_coverage: { name: "Espaciado y tamaños", found: "tokens para márgenes, padding y tamaños de elementos, en vez de valores en píxeles escritos directo en el código", gap: "No se encontraron tokens de espaciado ni de tamaños.", infer: "los espacios y tamaños del sistema", fix: "Incluir espaciados y tamaños como tokens." },
      typography: { name: "Tipografía", found: "tokens para familia tipográfica, tamaño, peso y alto de línea", gap: "No se encontraron tokens tipográficos.", infer: "la escala tipográfica", fix: "Incluir familias, tamaños y pesos tipográficos como tokens." },
      other_foundations: { name: "Otros fundamentos", found: "tokens para radios de borde, sombras, duración de animaciones u opacidad, en las categorías que el sistema efectivamente use", gap: "No se encontraron tokens de radio, sombra, borde, movimiento, opacidad ni z-index. Si el sistema no usa estas categorías, este punto no aplica realmente.", infer: "radios, sombras u otros fundamentos", fix: "Si el sistema usa radios, sombras, bordes o animaciones, agregarlos como tokens. Si no los usa, este punto puede ignorarse." },
      modes: { name: "Modos", found: "el mismo token con valores distintos según el modo (por ejemplo claro y oscuro), no un set de tokens completamente separado por modo", gap: "No se detectaron modos (claro/oscuro, densidad). Si el sistema es de un solo modo por diseño, no es necesariamente un defecto.", infer: "cómo cambian los valores entre modos", fix: "Si el sistema tiene modo oscuro u otras variantes, definirlas como modos de los tokens." },
      intent_documentation: { name: "Intención documentada", found: "una frase junto a cada token que diga para qué situación de diseño está pensado, no solo su nombre y su valor", gap: "Los valores existen, pero no siempre se explica qué intención o significado de diseño representa cada uno.", infer: "algunas decisiones semánticas sobre qué token usar", fix: "Documentar la intención de cada token (cuándo usarlo), no solo su nombre y su valor." },

      props_documented: { name: "Propiedades documentadas", found: "una lista de las propiedades que acepta cada componente, con su nombre", gap: "No todos los componentes tienen sus propiedades documentadas.", infer: "qué propiedades tiene cada componente", fix: "Documentar las propiedades de cada componente en una tabla: nombre, tipo, valores posibles y valor por defecto." },
      types: { name: "Tipos", found: "el tipo de dato de cada propiedad (texto, booleano, lista de opciones, etc.)", gap: "No siempre se indica el tipo de cada propiedad.", infer: "el tipo de algunas propiedades", fix: "Indicar el tipo de cada propiedad." },
      allowed_values: { name: "Valores permitidos", found: "los valores exactos que puede tomar cada propiedad (por ejemplo size: small | medium | large), no solo que «acepta un texto»", gap: "No siempre están definidos explícitamente todos los valores que una propiedad puede aceptar.", infer: "qué valores acepta cada propiedad", fix: "Hacer explícitos los valores permitidos de cada propiedad (por ejemplo, size: small, medium, large)." },
      defaults: { name: "Valores por defecto", found: "qué valor toma cada propiedad cuando no se especifica", gap: "No siempre se indica el valor por defecto de cada propiedad.", infer: "qué pasa cuando una propiedad no se especifica", fix: "Indicar el valor por defecto de cada propiedad." },
      variants: { name: "Variantes", found: "el nombre exacto de cada variante visual del componente (por ejemplo primary, secondary, ghost)", gap: "No todos los componentes documentan sus variantes.", infer: "qué variantes existen", fix: "Documentar las variantes de cada componente con su nombre exacto." },
      states: { name: "Estados", found: "los estados de interacción documentados por nombre (hover, foco, deshabilitado, error, cargando)", gap: "No todos los estados de los componentes están documentados.", infer: "qué estados existen (deshabilitado, error, cargando…)", fix: "Documentar los estados de cada componente: hover, foco, deshabilitado, error, cargando." },
      api_consistency: { name: "Consistencia de la API", found: "el mismo nombre de propiedad usado para el mismo concepto en todos los componentes (por ejemplo, siempre variant, nunca type en uno y kind en otro)", gap: "La forma de nombrar y describir las propiedades no es completamente consistente entre componentes.", infer: "algunas convenciones de API", fix: "Establecer una convención única para nombrar y documentar propiedades, y mantenerla en todos los componentes." },
      prop_purpose: { name: "Propósito de las propiedades", found: "una frase breve junto a cada propiedad que explique para qué sirve, no solo su nombre y tipo", gap: "No siempre se explica para qué sirve cada propiedad.", infer: "para qué sirven algunas propiedades", fix: "Agregar una descripción breve del propósito de cada propiedad." },

      purpose_identification: { name: "Propósito del componente", found: "una frase al inicio de cada componente que explique para qué sirve", gap: "No todos los componentes declaran para qué sirven.", infer: "para qué sirven algunos componentes", fix: "Empezar cada página de componente con una frase que diga para qué sirve." },
      component_selection: { name: "Cuándo usarlo", found: "una sección que diga en qué situaciones concretas corresponde usar el componente", gap: "No todos los componentes indican explícitamente cuándo usarlos.", infer: "cuándo usar cada componente", fix: "Agregar a cada componente una sección «Cuándo usarlo» con casos concretos." },
      disambiguation: { name: "Desambiguación", found: "una regla explícita que compare dos componentes parecidos y diga cuándo usar cada uno (por ejemplo, «usá Modal cuando..., usá Drawer cuando...»)", gap: "Hay componentes parecidos sin un criterio documentado para elegir entre ellos.", infer: "cómo elegir entre componentes parecidos", fix: "Explicar cuándo elegir cada uno de los componentes que se parecen (por ejemplo, modal o notificación).", na: "No se detectaron componentes parecidos entre sí, así que no hubo nada que desambiguar." },
      restrictions: { name: "Restricciones de uso", found: "frases explícitas del tipo «no hagas X» o «evitá Y» junto a cada componente", gap: "No todos los componentes documentan restricciones de uso (qué no hacer).", infer: "algunas restricciones de uso", fix: "Agregar reglas concretas de lo que no se debe hacer con cada componente." },
      justification: { name: "Cuándo no usarlo", found: "una sección que diga en qué situaciones NO corresponde usar el componente, idealmente sugiriendo qué usar en su lugar", gap: "No todos los componentes indican cuándo no usarlos.", infer: "cuándo no usar un componente", fix: "Agregar a cada componente una sección «Cuándo no usarlo», idealmente indicando qué usar en su lugar." },

      reuse_of_existing_components: { name: "Reutilización en patrones", found: "ejemplos de pantallas o flujos armados combinando los componentes ya documentados, no componentes nuevos inventados solo para el ejemplo", gap: "No se encontraron patrones que muestren cómo reutilizar los componentes existentes.", infer: "cómo reutilizar componentes en estructuras más grandes", fix: "Documentar patrones indicando qué componentes del sistema usan." },
      composition_rules: { name: "Reglas de composición", found: "qué componentes se combinan entre sí y en qué orden (por ejemplo, que un FormField siempre contiene un Label y un Input)", gap: "No todos los componentes documentan con qué otros se combinan y cómo.", infer: "algunas reglas de composición", fix: "Indicar, en cada componente, con qué otros se combina y cómo." },
      hierarchy_nesting: { name: "Jerarquía y anidación", found: "qué puede ir dentro de cada componente, y qué anidamientos no están permitidos", gap: "No siempre se explica qué puede ir dentro de qué.", infer: "qué puede ir dentro de qué", fix: "Documentar reglas de anidación: qué puede contener cada componente y qué no." },
      documented_patterns: { name: "Patrones documentados", found: "una sección de patrones (no solo componentes sueltos) con flujos completos como formularios, tablas con filtros o estados vacíos", gap: "No se encontraron patrones documentados.", infer: "cómo se arman pantallas y flujos", fix: "Crear una sección de patrones con ejemplos de pantallas o flujos completos." },
      layout_spacing: { name: "Layout y espaciado", found: "qué tokens de espaciado usar entre los componentes dentro de un patrón", gap: "No todos los patrones indican su distribución y espaciado.", infer: "la distribución y los espacios entre elementos", fix: "Indicar en cada patrón la distribución y los espacios, usando los tokens del sistema." },

      component_coverage: { name: "Cobertura de documentación", found: "al menos una descripción de propósito y uso por cada componente detectado, no solo una imagen o el nombre", gap: "No todos los componentes tienen documentación descriptiva.", infer: "qué hacen algunos componentes", fix: "Asegurar que cada componente tenga una página con descripción." },
      code_examples: { name: "Ejemplos de código", found: "al menos un fragmento de código por componente que muestre cómo implementarlo", gap: "No todos los componentes tienen ejemplos de código.", infer: "cómo se escribe el código de algunos componentes", fix: "Agregar al menos un ejemplo de código por componente." },
      executable_examples: { name: "Ejemplos ejecutables", found: "ejemplos que se puedan correr o editar en vivo (por ejemplo en Storybook o CodeSandbox), no solo texto de código", gap: "No todos los componentes tienen ejemplos que se puedan ejecutar tal cual.", infer: "si el código de ejemplo funciona", fix: "Ofrecer ejemplos ejecutables (por ejemplo, en Storybook o CodeSandbox)." },
      variants_states_explained: { name: "Variantes y estados explicados", found: "una explicación en texto de cuándo usar cada variante y qué representa cada estado, no solo mostrados visualmente", gap: "No siempre se explica en texto cuándo usar cada variante o qué significa cada estado.", infer: "el significado de algunas variantes y estados", fix: "Explicar con palabras cuándo usar cada variante y qué significa cada estado, no solo con imágenes." },
      accessibility: { name: "Accesibilidad", found: "información sobre uso con teclado, lectores de pantalla y contraste de color para cada componente", gap: "No todos los componentes documentan accesibilidad.", infer: "los requisitos de accesibilidad", fix: "Agregar una sección de accesibilidad por componente: teclado, lectores de pantalla, contraste." },
      versioning: { name: "Versionado", found: "un changelog o número de versión visible que indique qué tan actualizada está la documentación", gap: "No se encontró un registro de versiones o cambios.", infer: "qué versión del sistema está usando", fix: "Publicar un registro de cambios (changelog) y la versión actual del sistema." },
    },
  };

  const en = {
    ui: {
      question: "How ready is this Design System to work with AI agents?",
      scoreNote:
        "The score measures how ready the system is for an agent to discover, understand and use it without human intervention. It is not a measure of the Design System's quality for people.",
      gate:
        "Access (D1) is very low, so the overall result is capped at 40 regardless of the other dimensions: if an agent can't reach the information, nothing else can be put to use.",
      liveCaveat:
        "Some parts of the system couldn't be read from the site (see “Limitations”), so this result may underestimate the Design System.",
      canDo: "Can do well",
      mayInfer: "May still need to infer",
      cannot: "Can't yet do reliably",
      notEvaluated: "Couldn't be evaluated",
      therefore: "In short:",
      expected: "Expected to find:",
      chainTitle: "The capabilities an agent needs",
      chainLead: "Each dimension measures a capability an agent needs to work autonomously. They go from the most basic to the most advanced.",
      dimsTitle: "The dimensions, explained",
      aboutDim: "About this dimension",
      inThisDs: "In this Design System",
      qWhat: "What are we evaluating?",
      qPurpose: "What is it for?",
      qWhy: "Why does it matter for an agent?",
      qFound: "What did we find?",
      qMeaning: "What does it mean for the agent?",
      qImprove: "What should the team improve?",
      tagEvidence: "Evidence",
      tagInference: "Interpretation",
      tagReco: "Recommendation",
      tagLimit: "Limitation",
      result: "Result",
      capability: "Agentic capability evaluated",
      notScored: "No score",
      evidenceTitle: "Technical evidence",
      evCrit: "Technical criterion",
      evMeaning: "What it measures",
      evPoints: "Points",
      evStatus: "Status",
      stFound: "Found",
      stPartial: "Partial gap",
      stGap: "Gap",
      stNA: "Not applicable",
      stNotEval: "Not evaluable",
      engineFindings: "Engine findings for this dimension (original text)",
      engineLangNote: "",
      coverage: "Coverage",
      covComponents: "components detected",
      covScored: "components evaluated",
      covWithProps: "with properties found",
      covPatterns: "patterns detected",
      foundIntro: "The system correctly documents:",
      gapsIntroOne: "We found one gap:",
      gapsIntroMany: "We found {n} gaps:",
      noGaps: "No gaps were detected in this dimension.",
      noneFound: "No supporting evidence was found for any criterion in this dimension.",
      naIntro: "Not applicable in this system:",
      excludedIntro: "Couldn't be determined (counts neither for nor against):",
      noActions: "No pending actions for this dimension.",
      dimNotEvaluable:
        "This dimension couldn't be evaluated: what was reviewed didn't contain enough information to determine a result. This doesn't mean it's missing from the Design System, only that it couldn't be verified.",
      dimNotEvaluableMeaning: "Without evidence, it isn't possible to anticipate how an agent would perform on this capability.",
      dimNotEvaluableImprove:
        "Make sure this information is published somewhere an agent can reach (for example, public pages linked from the documentation) and evaluate again.",
      d7Pending: "Not evaluated yet in this phase.",
      limitationsTitle: "Limitations of this evaluation",
      limDemo: "This is a demo result: computed with the real engine, on a saved example, not on a real site.",
      limLive: "Live result: the site's public pages were reviewed just now.",
      limDocsOnly:
        "This evaluation analyzes what the Design System publishes; it doesn't put an agent to work with it. Checking an agent's real behavior belongs to Phase 2.",
      limFailed: "{n} page(s) of the site couldn't be opened.",
      limLimited: "The review reached its page limit before covering the whole site.",
      limNotEval: "Couldn't be evaluated: {list}.",
      limD3Live:
        "No component properties or variants were found on the reviewed pages. This version of the evaluator can't yet read property tables or variant lists from web pages, or documentation hosted on other sites (for example, Storybook), so D3 may be underestimated.",
      noBasisApi:
        "no properties were found to compare across components. The engine counts it as 0 in the score, but that doesn't mean the API is inconsistent.",
      stNone: "no evidence",
      meaningCaveat: "Based on the information that could be read:",
      certDemonstrated: "Found",
      certPartial: "Partly found",
      certNotDemonstrated: "Not found",
      certAbsent: "Doesn't exist",
      certNotEvaluated: "Couldn't be read",
      certNA: "Not applicable",
      certHelp:
        "Found: we looked and it's there. Not found: we looked in what we read and it didn't show up; it may be elsewhere. Doesn't exist: we're certain it's missing. Couldn't be read: the evaluator couldn't look for it; it's left out of the score.",
      rsObservable: "we looked in the pages that were read and didn't find it in a format the evaluator recognizes",
      rsLinked: "the evaluator only detects it if it's published and linked from the reviewed pages",
      rsIncomplete: "the retrieved evidence is incomplete",
      rsUnreadable: "the way it's published can't be read from web pages; it's left out of the score",
      rsExternal: "it lives in an official source of the system (Storybook, repository or package) that this version doesn't read yet; it's left out of the score",
      rsNotLooked: "the place where it usually lives wasn't read; it's left out of the score",
      rsNotRead: "the system publishes it, but those pages weren't in the sample; it's left out of the score",
      rsProbed: "we looked at its standard address and it isn't there",
      rsExcluded: "there wasn't enough information to evaluate it; it doesn't count in the score",
      incompleteBadge: "Incomplete evaluation",
      completeBadge: "Complete evidence",
      incompleteLead: "The result is limited by:",
      incompleteReading:
        "So the score should be read as the readiness level demonstrated with the retrieved evidence, not as a definitive measurement of the whole Design System.",
      rLimited: "the crawl hit its page, depth or time limit before finishing",
      rFailed: "{n} page(s) couldn't be retrieved",
      rGate: "mechanical access (D1) was low, which caps the overall result at 40",
      rUnreadable: "some content is published in a way that can't be read from web pages",
      rExternal: "some information lives in official sources of the system (Storybook, repository or packages) that this version doesn't read yet",
      rNotLooked: "some places where the information usually lives weren't read",
      rLowCoverage: "only {pct}% of what makes up the score could be reviewed, so no level is assigned",
      rNotEval: "{list} couldn't be evaluated",
      dimIncomplete: "Incomplete evidence",
      dimComplete: "Complete evidence",
      scoreDemonstrated: "demonstrated",
      noBandChip: "No level: less than half was reviewed",
      downloadGroup: "Download the result",
      downloadPdf: "Download PDF",
      downloadJson: "Download data (JSON)",
      downloadNote:
        "We don't store your result: if you close this tab, it's gone. To keep it, download it; the file is generated in your browser. For the PDF, choose “Save as PDF” in the window that opens.",
      printHead: "AI agent readiness report for a Design System",
      evaluatedAt: "Evaluated on {date}",
      printFooter:
        "Generated with Agentic DS (Phase 1). The result reflects the evidence that could be retrieved on the evaluation date; it isn't a certification or a definitive measurement of the Design System.",
      sourcesTitle: "What we reviewed",
      sourcesJump: "See what we reviewed ({n} read)",
      sourcesLead: "We started from {url}. This is the list of what the evaluator tried to read and what happened with each item.",
      sourcesSummary: "Read: {read}. Couldn't be opened: {failed}. Left unread because of the evaluation's limits: {skipped}. Out of scope: {out}.",
      usedTabUnused: "another tab of “{name}”",
      usedPattern: "read as pattern “{name}”",
      sourcesDemo: "This is a demo result: no real site was read.",
      sourcesUnavailable: "This result doesn't include the list of what was reviewed. Evaluate the address again to see it.",
      sourcesMore: "And {n} more not shown.",
      sourcesNotYet:
        "The evaluator looks for llms.txt and sitemap.xml, uses the menu if it can't find them, and reads an ordered sample of the system. It doesn't read Storybook, the code repository or published packages yet: it only notes them if the documentation links to them.",
      srcRead: "Read",
      srcReadHelp: "Next to each one, what the evaluator used it for.",
      srcNotPresent: "Looked for, not there",
      srcNotPresentHelp: "Files the evaluator looks for at well-known addresses. Their absence isn't an error on the site.",
      srcFailed: "Couldn't be opened",
      srcSkipped: "Found but not read",
      srcSkippedHelp: "Links the evaluator found but didn't get to read because of page, time or depth limits. They weren't used in the score.",
      srcOutOfScope: "Out of scope",
      srcOutOfScopeHelp: "Links to other sites or to sections that don't look like part of the Design System. They aren't followed for now.",
      srcDuplicate: "Duplicates",
      srcDuplicateHelp: "Addresses that led to a page already read. They weren't read twice.",
      roleEntry: "address you entered",
      roleRoot: "Design System home",
      roleOfficial: "official source (not read yet)",
      roleListed: "from the site's list",
      roleWellKnown: "well-known file",
      usedComponent: "read as component “{name}”",
      usedTokens: "token file (tokens read: {n})",
      usedManifest: "agent index ({name})",
      usedSchema: "type definitions",
      usedNothing: "read; not recognized as a component, tokens or index",
      srHttp404: "doesn't exist (404 error)",
      srHttpRefused: "the site refused the automated visit (error {n})",
      srHttpServer: "site error (error {n})",
      srHttpOther: "the site responded with error {n}",
      sourceReasons: {
        OUTSIDE_SCOPE: "another site or a section that doesn't look like part of the Design System",
        QUERY_VARIANT_LIMIT: "variant of a page already included (only a parameter changes)",
        TIME_LIMIT: "the evaluation's time limit was reached",
        PAGE_LIMIT: "the page limit was reached",
        DEPTH_LIMIT: "too far from the starting page",
        ALREADY_READ: "already read under another address",
        REDIRECTED_OUTSIDE: "redirects to another site",
        HTML_FALLBACK: "the site returned a regular page instead of the file",
        EMPTY: "the file is empty",
        TIMEOUT: "took too long to respond",
        NETWORK_ERROR: "connection error",
        BLOCKED: "internal address blocked for security",
        TOO_LARGE: "too large (over 5 MB)",
        TOO_MANY_REDIRECTS: "too many redirects",
        NOT_PROCESSED: "wasn't processed",
        NOT_IN_SAMPLE: "it's in the site's list, but wasn't in the sample",
        EXTERNAL_NOT_READ_YET: "linked from the documentation; this version doesn't read it yet",
        NOT_A_SITEMAP: "the address exists, but it isn't a sitemap",
      },
      limNotEvaluableNow:
        "What can't be read yet: content that only appears when JavaScript runs, pages behind a login, Figma files, and documentation published on other sites (for example, Storybook or the repository). That's marked as “couldn't be read” and left out of the score. If what could be reviewed is less than half of the score, no level is assigned.",
      limExternal: "Some information lives in official sources of the system (Storybook, repository or packages) that this version doesn't read yet. Those criteria were left out of the score.",
      limNotLooked: "Some places where the information usually lives (patterns, tokens) weren't read. Those criteria were left out of the score.",
      discStart: "we started at {url}",
      discRoot: "recognized the Design System at {url}",
      discFound: "found {n} components and evaluated {m}",
      discSampledOnly: "evaluated {m} components",
      discMethod: {
        "llms.txt": "The page list came from its llms.txt.",
        sitemap: "The page list came from its sitemap.xml.",
        navigation: "The page list came from its navigation menu.",
        links: "We didn't find a page list, so we followed links from the address you entered.",
      },
      discOfficial: "The documentation links to these official sources (not read yet): {list}.",
      officialKind: { storybook: "Storybook", repository: "code repository", package: "published package" },
      provisionalLead:
        "Only {pct}% of what makes up the score could be reviewed. With less than half we don't assign a level: the number reflects what was reviewed, but it isn't enough for a conclusion.",
      provisionalSummary:
        "This score only reflects what the evaluator could read. Below you can see which capabilities were demonstrated and which couldn't be evaluated.",
      dimUnreadable: "Couldn't be read",
      dimUnreadableNote: "",
      notDemonstratedList: "Couldn't be demonstrated",
      notDemonstratedCap: "The “{verb}” capability is not demonstrated, not necessarily absent.",
      meaningIncomplete: "Based on the retrieved evidence:",
      grpDemonstrated: "Found. The system documents:",
      grpNotDemonstrated: "Not found (we looked and it didn't show up; it may be elsewhere):",
      grpAbsent: "Doesn't exist:",
      grpNotEvaluated: "Couldn't be read (left out of the score):",
      grpNA: "Not applicable in this system:",
      partialMark: "partly",
      recoLimits: "Limitation of the evaluation, not of the Design System:",
      recoLimitsTail: "This isn't a recommendation for the team: it first needs to be evaluable.",
      recoDirect: "Design System gaps:",
      recoPossible: "Possible gaps (verify before acting). If this really doesn't exist in the system:",
      recoNoneFirm: "With the available evidence there are no firm recommendations for this dimension.",
      d2NotFoundLive:
        "No tokens were found in the foundations pages that were read, neither as a table nor as a file.",
      d2NotFoundDemo: "The analyzed evidence doesn't include structured tokens.",
      d2FixPossible: "Publish the tokens in a JSON file (ideally in W3C DTCG format) and link it from the documentation.",
      emptyDimNote: "The engine didn't detail criteria for this dimension.",
      dimPartialLead: "This dimension could only be partly evaluated: of {total} criteria, {dem} were demonstrated, {nd} couldn't be demonstrated and {ne} couldn't be evaluated.",
      engineFindingsIncomplete: "With incomplete evidence, absence statements (“no … detected”) should be read as “not found”, not as “doesn't exist”.",
      stPartialShort: "partial",
      limD5Live:
        "No patterns or composition rules were found in a format the evaluator can read. If the system documents them, D5 may be underestimated.",
      limD7: "D7 (Design–Code consistency) wasn't evaluated: it requires a Figma connection.",
      d3LiveImprove:
        "First, check whether properties and variants are already documented elsewhere (for example, Storybook or a props table): this version of the evaluator can't read them from the web yet. If they really are missing:",
      d5LiveImprove:
        "First, check whether the system already documents patterns in a format the evaluator can't read yet. If they really are missing:",
      bandLabel: { Opaco: "Opaque", Legible: "Legible", Interpretable: "Interpretable", Operable: "Operable" },
      bandRange: { Opaco: "0–25", Legible: "26–50", Interpretable: "51–75", Operable: "76–100" },
      modeDemo: "Demo result",
      modeLive: "Live result",
      noResult: "There isn't enough evidence to give an overall result.",
      noResultD1:
        "The documentation couldn't be accessed from that address, so an honest result isn't possible. Try the page of a specific component (for example, the button) and check that the site is public.",
      noResultCoverage:
        "Too little of the system could be reviewed from that address to give an honest result. Try the page of a specific component (for example, the button).",
    },

    bands: {
      Operable: {
        summary:
          "This Design System is highly prepared for an agent to discover, interpret and reuse most of the system autonomously.",
        conclusion:
          "The system is operable for agents, but there are still points where the agent has to infer decisions that the Design System should ideally state explicitly.",
        conclusionNoGaps:
          "The system is operable for agents: no points were detected where the agent would have to infer important decisions.",
      },
      Interpretable: {
        summary:
          "An agent can understand a good part of this Design System, but at several points it will have to infer decisions the system doesn't state explicitly.",
        conclusion:
          "The system is interpretable for agents: an agent can work with it, but its autonomy is limited by everything it still has to infer.",
      },
      Legible: {
        summary:
          "An agent can read part of this Design System's documentation, but lacks the structured information to use it without guessing.",
        conclusion:
          "The system is legible for agents but not yet usable autonomously: many decisions would be left to the agent.",
      },
      Opaco: {
        summary: "Today an agent can barely access or interpret this Design System on its own.",
        conclusion:
          "The system is opaque to agents: before thinking about autonomy, the first step is for the agent to be able to reach the information.",
      },
    },

    dims: {
      D1: {
        name: "Access", verb: "Discover", can: "discover and retrieve the system's information",
        what: "Whether an agent can mechanically find and retrieve the information it needs to work with the Design System: documentation, component catalog, properties and types, tokens and structured information.",
        purpose: "A Design System can have excellent documentation and perfectly defined components, but if that information isn't accessible to an agent, in practice the agent can't use it.",
        why: "It's the first capability: discovering. Before an agent can interpret or use a Design System, it has to be able to reach it. That's why, if access is very low, the overall result is capped regardless of everything else.",
        meaning: {
          full: "The agent has a solid base to start working with the Design System without depending on a person to tell it where the information is.",
          high: "The agent can reach most of the information on its own, although some pieces won't be in a format it can retrieve directly.",
          mid: "The agent can reach part of the information, but other important pieces aren't in a format it can retrieve by itself. It will depend more on someone pointing the way.",
          low: "The agent has serious trouble reaching the system's information. Without access, the other capabilities can barely be used.",
        },
      },
      D2: {
        name: "Tokens", verb: "Reuse", can: "reuse the system's visual decisions (tokens)",
        what: "Whether an agent can identify and reuse the visual values defined by the Design System: color, spacing, typography, sizing, etc.",
        purpose: "Tokens let the system's visual decisions be expressed in a reusable way, instead of depending on values invented for each interface.",
        why: "An agent can produce a visually plausible interface using arbitrary values, and that doesn't mean it's using the Design System. To work agentically, it must be able to recognize: “the system already made this decision; I should reuse it.”",
        meaning: {
          full: "The agent can reuse the system's values and understand what each one represents, instead of inventing them.",
          high: "The agent can reuse existing values, but some decisions still require inference, for example when several options could fit the same use.",
          mid: "The agent finds part of the system's values, but in many cases it will have to choose without knowing which one applies, or approximate values.",
          low: "The agent can't find the system's values in a reusable format. It will most likely generate similar values, but not the system's own.",
        },
      },
      D3: {
        name: "Components & API", verb: "Use", can: "correctly use the existing components",
        what: "Whether the Design System provides enough information for an agent to understand and correctly use its components. Finding a component like Button isn't enough: the agent must understand its properties, accepted values, variants and states, defaults, and what each property is for.",
        purpose: "It shows whether the components are truly usable by a system that works autonomously. A person can ask another designer “which variant should I use here?”; an agent may not have that option. The information has to live in the system itself.",
        why: "An agent can generate syntactically valid code without using the Design System correctly. If the API is incomplete or ambiguous, it may invent values, use properties that don't exist, combine variants incorrectly, ignore states, or read similar components differently.",
        meaning: {
          full: "The agent has what it needs to use the components without guessing how they work.",
          high: "The agent has enough information to use most components correctly. In some cases it will have to infer, and the risk isn't that it can't use them, but that it produces a seemingly correct implementation that uses the API in a way the system doesn't intend.",
          mid: "The agent can use the components, but will often have to guess properties, values or states. It will likely produce implementations that work but don't respect the system.",
          low: "The agent can't find how components are configured. It will be able to name them, but will have to guess almost everything about using them.",
        },
      },
      D4: {
        name: "Semantics", verb: "Decide", can: "choose the right component for each situation",
        what: "Whether the Design System explains what each component is for, when to use it, when not to, what to avoid, and how to choose between similar components.",
        purpose: "The API says how to use a component; semantics says when it's the right one. It's the difference between a catalog of parts and a system with judgment.",
        why: "Without explicit criteria, an agent chooses between technically valid components without grounds: a modal where a notification belonged, a checkbox where a switch should go. The result works, but it isn't the decision the system would have made.",
        meaning: {
          full: "The agent finds explicit criteria to decide which component to use, when not to use it, and what to avoid.",
          high: "The agent finds criteria for most decisions, but in some cases it will have to decide on its own what the system doesn't explain.",
          mid: "The agent can tell what several components are for, but many usage decisions will be left to its judgment.",
          low: "The agent finds no criteria for when to use each component. It will choose by resemblance, not by design intent.",
        },
      },
      D5: {
        name: "Patterns", verb: "Compose", can: "combine components following the system's rules",
        what: "Whether the Design System documents how components combine: patterns (forms, tables, pages), composition rules, what can go inside what, and layout and spacing between elements.",
        purpose: "Real screens aren't built from a single component. Patterns capture decisions the team has already made about how things are put together.",
        why: "An agent that knows how to use each component on its own can still assemble incoherent screens. To compose autonomously it needs explicit rules for combining them.",
        meaning: {
          full: "The agent can compose screens following patterns and rules documented by the system.",
          high: "The agent can follow the system's patterns in most cases, but will have to infer some combinations.",
          mid: "The agent finds some patterns, but many composition decisions will be left to its judgment.",
          low: "The agent finds no patterns or composition rules. It will assemble screens by intuition, not by following the system.",
        },
      },
      D6: {
        name: "Documentation", verb: "Resolve", can: "get context and examples to resolve doubts",
        what: "Whether there is enough retrievable documentation —descriptions, code examples, explanations of variants and states, accessibility and versions— for an agent to have context when making decisions.",
        purpose: "Documentation is the context around the parts: it explains, shows examples, and helps resolve cases the API doesn't cover on its own.",
        why: "When something is unclear, a person asks or looks for an example. An agent only has what the system publishes. Without examples or explanations, it resolves doubts by guessing.",
        meaning: {
          full: "The agent has enough context and examples to resolve doubts without human intervention.",
          high: "The agent has good context for most cases, but some questions won't find an answer in the documentation.",
          mid: "The agent finds context for part of the system, but many questions will lack examples or explanations to lean on.",
          low: "The agent finds almost no context or examples. It will resolve most doubts on its own.",
        },
      },
      D7: {
        name: "Design–Code consistency", verb: "Verify", can: "verify that design and code represent the same system",
        what: "Whether what's in design (Figma) and what's in code truly represent the same system: the same components, variants and values.",
        purpose: "When design and code drift apart, in practice there are two versions of the system and neither is fully reliable.",
        why: "An agent working from design or from code needs to trust that both match. If they don't, it reproduces the inconsistency.",
        notEvaluated: "This dimension isn't evaluated yet: it requires connecting the Design System's Figma file.",
      },
    },

    subs: {
      documentation_recoverability: { name: "Retrievable documentation", found: "documentation content present in the HTML the server returns (not only appearing after JavaScript runs), and pages that respond without errors", gap: "Some documentation pages couldn't be retrieved.", infer: "parts of the documentation it couldn't reach", fix: "Make sure documentation pages are public, load without errors, and have their content in the HTML (not only after running JavaScript)." },
      component_index: { name: "Component index", found: "a component index (for example index.json or stories.json) listing each component's name and path, in a machine-readable format like JSON — not just links inside HTML pages", gap: "No machine-readable component index was found (for example, an index.json).", infer: "which components exist in the system", fix: "Publish an index of all components in a structured file (for example, the index.json Storybook generates)." },
      props_types_accessibility: { name: "Accessible properties and types", found: "each component's properties (name, type and allowed values) published in a structured format like JSON or TypeScript, not only described in prose", gap: "Component properties and types weren't found in a structured format an agent can retrieve.", infer: "which properties and types each component has", fix: "Publish each component's properties, with types and values, in a structured format — not only in text or images." },
      structured_tokens: { name: "Structured tokens", found: "a token file in a data format (JSON, ideally following the W3C Design Tokens standard) with color, spacing, typography values, etc. — not just loose CSS variables", gap: "No tokens were found in a structured file an agent can download.", infer: "where the system's visual values live", fix: "Publish the tokens in a JSON file linked from the documentation." },
      types_or_schema: { name: "Types or schema", found: "a type-definition file (.d.ts) or a JSON Schema describing exactly which props each component accepts and their types", gap: "No code types or schema were found (for example, .d.ts files or JSON Schema).", infer: "the exact structure of the APIs", fix: "Publish component types (.d.ts files or a JSON Schema) somewhere accessible." },
      agent_manifest: { name: "Agent manifest", found: "an llms.txt or AGENTS.md file at the site root, in plain text, stating what's in the system and where to start exploring it", gap: "No agent manifest was found (llms.txt or AGENTS.md).", infer: "where to start exploring the system", fix: "Add an llms.txt file at the site root: a short text index that tells an agent where everything is." },
      agent_interface: { name: "Agent interface", found: "an MCP server or other API an agent can query directly, without having to read and interpret HTML pages", gap: "No direct interface for agents was found (for example, an MCP server).", infer: "how to query the system without crawling web pages", fix: "Offer an MCP server or another interface so agents can query the system directly." },

      tokens_identifiable: { name: "Identifiable tokens", found: "at least one file or section where visual values (colors, spacing, etc.) have a proper name, not just loose numbers in the CSS", gap: "No identifiable tokens were found.", infer: "which visual values the system defines", fix: "Express visual decisions as named tokens, not loose values." },
      structured_format: { name: "Structured format", found: "tokens exported as data (JSON or YAML), not only as CSS or Sass variables", gap: "Tokens aren't in a structured format.", infer: "how to read the tokens", fix: "Export tokens in a standard format, ideally W3C Design Tokens (DTCG)." },
      naming_consistency: { name: "Naming consistency", found: "every token following the same naming pattern (for example, always category-property-variant), instead of mixing several styles", gap: "Token names don't follow a single convention.", infer: "what tokens it hasn't seen are called", fix: "Unify the naming convention across all tokens." },
      primitive_to_semantic: { name: "Base → semantic relationship", found: "intent-named tokens (for example color-action-primary) that reference a base token (for example blue-600), instead of components using the base value directly", gap: "The relationship between base tokens and meaningful tokens wasn't found, or was only partly found.", infer: "which token fits each use", fix: "Separate base tokens (for example, blue-600) from meaningful tokens (for example, color-action-primary), and make the latter point to the former." },
      color_coverage: { name: "Color", found: "color tokens named by usage (for example color-text-primary, color-border-error), not just an unassigned color palette", gap: "No color tokens were found.", infer: "the system's colors", fix: "Include colors as tokens." },
      spacing_sizing_coverage: { name: "Spacing and sizing", found: "tokens for margins, padding and element sizes, instead of pixel values written directly in the code", gap: "No spacing or sizing tokens were found.", infer: "the system's spacing and sizes", fix: "Include spacing and sizes as tokens." },
      typography: { name: "Typography", found: "tokens for font family, size, weight and line height", gap: "No typography tokens were found.", infer: "the type scale", fix: "Include font families, sizes and weights as tokens." },
      other_foundations: { name: "Other foundations", found: "tokens for border radius, shadows, animation duration or opacity, in whichever categories the system actually uses", gap: "No radius, shadow, border, motion, opacity or z-index tokens were found. If the system doesn't use these categories, this point doesn't really apply.", infer: "radii, shadows or other foundations", fix: "If the system uses radii, shadows, borders or motion, add them as tokens. If not, this point can be ignored." },
      modes: { name: "Modes", found: "the same token with different values per mode (for example light and dark), not a fully separate token set per mode", gap: "No modes were detected (light/dark, density). If the system is single-mode by design, this isn't necessarily a flaw.", infer: "how values change between modes", fix: "If the system has a dark mode or other variants, define them as token modes." },
      intent_documentation: { name: "Documented intent", found: "a sentence next to each token stating what design situation it's meant for, not just its name and value", gap: "The values exist, but it isn't always explained what design intent or meaning each one represents.", infer: "some semantic decisions about which token to use", fix: "Document each token's intent (when to use it), not only its name and value." },

      props_documented: { name: "Documented properties", found: "a list of the properties each component accepts, by name", gap: "Not every component has its properties documented.", infer: "which properties each component has", fix: "Document each component's properties in a table: name, type, possible values and default." },
      types: { name: "Types", found: "the data type of each property (string, boolean, enum, etc.)", gap: "The type of each property isn't always stated.", infer: "the type of some properties", fix: "State the type of each property." },
      allowed_values: { name: "Allowed values", found: "the exact values a property can take (for example size: small | medium | large), not just that it \"accepts a string\"", gap: "Not all the values a property can accept are always explicitly defined.", infer: "which values each property accepts", fix: "Make each property's allowed values explicit (for example, size: small, medium, large)." },
      defaults: { name: "Default values", found: "what value each property takes when it isn't specified", gap: "Each property's default value isn't always stated.", infer: "what happens when a property isn't set", fix: "State each property's default value." },
      variants: { name: "Variants", found: "the exact name of each visual variant of the component (for example primary, secondary, ghost)", gap: "Not every component documents its variants.", infer: "which variants exist", fix: "Document each component's variants with their exact names." },
      states: { name: "States", found: "interaction states documented by name (hover, focus, disabled, error, loading)", gap: "Not all component states are documented.", infer: "which states exist (disabled, error, loading…)", fix: "Document each component's states: hover, focus, disabled, error, loading." },
      api_consistency: { name: "API consistency", found: "the same property name used for the same concept across every component (for example, always variant, never type on one and kind on another)", gap: "The way properties are named and described isn't fully consistent across components.", infer: "some API conventions", fix: "Establish one convention for naming and documenting properties, and keep it across all components." },
      prop_purpose: { name: "Property purpose", found: "a short phrase next to each property explaining what it's for, not just its name and type", gap: "It isn't always explained what each property is for.", infer: "what some properties are for", fix: "Add a short description of each property's purpose." },

      purpose_identification: { name: "Component purpose", found: "a sentence at the start of each component explaining what it's for", gap: "Not every component states what it's for.", infer: "what some components are for", fix: "Start each component page with a sentence saying what it's for." },
      component_selection: { name: "When to use it", found: "a section stating the concrete situations where the component should be used", gap: "Not every component explicitly says when to use it.", infer: "when to use each component", fix: "Add a “When to use” section with concrete cases to each component." },
      disambiguation: { name: "Disambiguation", found: "an explicit rule comparing two similar components and stating when to use each (for example, \"use Modal when..., use Drawer when...\")", gap: "There are similar components without a documented criterion for choosing between them.", infer: "how to choose between similar components", fix: "Explain when to choose each of the components that look alike (for example, modal or notification).", na: "No similar components were detected, so there was nothing to disambiguate." },
      restrictions: { name: "Usage restrictions", found: "explicit \"don't do X\" or \"avoid Y\" statements next to each component", gap: "Not every component documents usage restrictions (what not to do).", infer: "some usage restrictions", fix: "Add concrete rules about what not to do with each component." },
      justification: { name: "When not to use it", found: "a section stating the situations where the component should NOT be used, ideally suggesting what to use instead", gap: "Not every component says when not to use it.", infer: "when not to use a component", fix: "Add a “When not to use” section to each component, ideally saying what to use instead." },

      reuse_of_existing_components: { name: "Reuse in patterns", found: "examples of screens or flows assembled from the components already documented, not new components invented just for the example", gap: "No patterns were found showing how to reuse existing components.", infer: "how to reuse components in larger structures", fix: "Document patterns, stating which system components they use." },
      composition_rules: { name: "Composition rules", found: "which components combine with which, and in what order (for example, that a FormField always contains a Label and an Input)", gap: "Not every component documents what it combines with and how.", infer: "some composition rules", fix: "State, for each component, what it combines with and how." },
      hierarchy_nesting: { name: "Hierarchy and nesting", found: "what can go inside each component, and which nestings aren't allowed", gap: "It isn't always explained what can go inside what.", infer: "what can go inside what", fix: "Document nesting rules: what each component can and can't contain." },
      documented_patterns: { name: "Documented patterns", found: "a patterns section (not just standalone components) with complete flows like forms, filterable tables or empty states", gap: "No documented patterns were found.", infer: "how screens and flows are put together", fix: "Create a patterns section with examples of complete screens or flows." },
      layout_spacing: { name: "Layout and spacing", found: "which spacing tokens to use between components within a pattern", gap: "Not every pattern states its layout and spacing.", infer: "layout and spacing between elements", fix: "State each pattern's layout and spacing, using the system's tokens." },

      component_coverage: { name: "Documentation coverage", found: "at least a purpose-and-usage description for each detected component, not just an image or its name", gap: "Not every component has descriptive documentation.", infer: "what some components do", fix: "Make sure every component has a page with a description." },
      code_examples: { name: "Code examples", found: "at least one code snippet per component showing how to implement it", gap: "Not every component has code examples.", infer: "how to write the code for some components", fix: "Add at least one code example per component." },
      executable_examples: { name: "Executable examples", found: "examples that can be run or edited live (for example in Storybook or CodeSandbox), not just code as text", gap: "Not every component has examples that run as-is.", infer: "whether the example code works", fix: "Offer executable examples (for example, in Storybook or CodeSandbox)." },
      variants_states_explained: { name: "Variants and states explained", found: "a written explanation of when to use each variant and what each state means, not just shown visually", gap: "It isn't always explained in words when to use each variant or what each state means.", infer: "the meaning of some variants and states", fix: "Explain in words when to use each variant and what each state means, not only with images." },
      accessibility: { name: "Accessibility", found: "information about keyboard use, screen readers and color contrast for each component", gap: "Not every component documents accessibility.", infer: "accessibility requirements", fix: "Add an accessibility section per component: keyboard, screen readers, contrast." },
      versioning: { name: "Versioning", found: "a visible changelog or version number indicating how current the documentation is", gap: "No version or change log was found.", infer: "which version of the system it's using", fix: "Publish a changelog and the system's current version." },
    },
  };

  // Mismos pesos que engine/config/weights.json — solo se usan para ORDENAR qué
  // gaps mostrar primero en el resumen, nunca para recalcular un score.
  const WEIGHTS = { D1: 0.2, D2: 0.15, D3: 0.2, D4: 0.25, D5: 0.1, D6: 0.1 };

  window.AgenticDSReport = { es, en, WEIGHTS };
})();
