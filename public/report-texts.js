// Capa de interpretación del informe (Fase 1).
//
// Todo el texto es plantilla fija: se elige según los resultados reales del
// motor (score por dimensión, puntos por criterio). No hay IA redactando, no se
// cambia ningún score y no se inventa evidencia. Cada criterio técnico del motor
// (sub_criteria) tiene aquí su traducción humana; el identificador técnico se
// sigue mostrando en la sección "Evidencia técnica".
//
// Interpretación por dimensión: usa los mismos niveles que el score global,
// leídos de report.readiness_levels (engine/config/rules.json):
//   full  = nivel más alto sin gaps
//   high  = nivel más alto, con gaps
//   mid   = segundo nivel
//   low   = niveles inferiores
//
// Fase 1 solo inspecciona lo que el sistema publica. Los textos de resultado
// describen esa evidencia; no afirman lo que un agente logra hacer (eso es
// Fase 2). tests/report-claims.test.js lo verifica.
(function () {
  const es = {
    ui: {
      question: "¿Qué tan preparado está este Design System para trabajar con agentes?",
      scoreNote:
        "El puntaje mide cuánto de lo que un agente necesitaría para descubrir, entender y usar el sistema está publicado en un formato recuperable. Se basa en lo publicado; no pone a un agente a ejecutar tareas. No mide la calidad del Design System para personas.",
      gate:
        "El acceso (D1) es muy bajo, así que el resultado general queda limitado a un máximo de 40, sin importar las demás dimensiones: si un agente no puede llegar a la información, lo demás no se puede aprovechar.",
      liveCaveat:
        "Algunas partes del sistema no se pudieron leer desde el sitio (ver «Limitaciones»), así que este resultado podría subestimar al Design System.",
      canDo: "Bien documentado",
      mayInfer: "Lo que un agente todavía tendría que inferir",
      cannot: "Con poca evidencia publicada",
      notEvaluated: "No se pudo evaluar",
      therefore: "Por tanto:",
      expected: "Se esperaba encontrar:",
      chainTitle: "Lo que necesita un agente",
      chainLead: "Cada dimensión revisa si el sistema publica lo que un agente necesitaría para una capacidad, de la más básica a la más avanzada. Se revisa lo publicado; no se pone a un agente a ejecutar tareas.",
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
      capability: "Capacidad relacionada",
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
        "no se encontraron propiedades para comparar entre componentes. Este criterio queda fuera de la nota (no cuenta como 0) y no indica que la API sea inconsistente.",
      stNone: "sin evidencia",
      meaningCaveat: "Con la información que se pudo leer:",
      // ---- certeza de la evidencia ----
      certDemonstrated: "Encontrado",
      certPartial: "Encontrado en parte",
      certNotDemonstrated: "No encontrado",
      certAbsent: "No existe",
      certNotEvaluated: "No se pudo leer",
      certNA: "No aplica",
      certScope: "Fuera de esta fase",
      grpScope: "Fuera del alcance de esta fase (no cuenta en la nota):",
      rsNoPairs:
        "esta versión no detecta por separado qué componentes se parecen, así que no sabe cuáles necesitarían una regla para elegir entre ellos. Las frases de desambiguación encontradas se registran como evidencia, pero no puntúan.",
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
      incompleteWhy: "Por qué es incompleta ({n})",
      howTitle: "Cómo se hizo esta evaluación",
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
        "El servidor solo conserva tu resultado unos minutos: descárgalo para guardarlo. Para el PDF, elige «Guardar como PDF».",
      coverageVaries:
        "La cantidad de páginas leídas puede variar entre una evaluación y otra del mismo sitio, sobre todo en sitios lentos o cuando se alcanza el límite de tiempo. Por eso dos evaluaciones pueden dar resultados algo distintos. En «Qué revisamos» está lo que se leyó en esta.",
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
      sourcesUnavailable: "Este resultado no incluye la lista de lo revisado. Vuelve a evaluar la dirección para verla.",
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
      roleAdapter: "misma página en formato legible por máquina",
      roleOfficialRead: "fuente oficial que enlaza el sistema",
      usedComponentIndex: "índice de componentes del Storybook (componentes listados: {n})",
      usedRecovered: "la página venía vacía (se arma con JavaScript); el contenido se leyó de aquí",
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
      rateQ: "¿Qué te parece este resultado?",
      rateSub: "Tu feedback ayuda a mejorar Agentic DS.",
      rateCta: "Califica este resultado",
      limAgentFiles:
        "Detectar un servidor MCP, una API, un llms.txt o un AGENTS.md solo confirma que existen o que la documentación los menciona. El evaluador no comprueba si son accesibles, si funcionan ni si requieren credenciales.",
      limNoContradictions:
        "Esta versión no busca contradicciones entre fuentes (por ejemplo, entre una página y un archivo de tokens). Que el informe no muestre contradicciones no significa que no existan.",
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
      discRendered: "Este sitio solo muestra su contenido con JavaScript: para leerlo cargamos {n} página(s) con un navegador. Muchos agentes no ejecutan JavaScript, y por eso cuenta en Acceso (D1).",
      rJsUnavailable: "este sitio arma su contenido con JavaScript y el navegador del evaluador no estuvo disponible, así que esas páginas no se pudieron leer",
      rJsPartial: "{n} página(s) que arman su contenido con JavaScript no se pudieron abrir (por tiempo o porque fallaron al cargar)",
      officialKind: { storybook: "Storybook", repository: "repositorio de código", package: "paquete publicado" },
      provisionalLead:
        "Solo se pudo revisar el {pct} % de lo que compone la nota. Con menos de la mitad no asignamos nivel: el número refleja lo revisado, pero no alcanza para una conclusión.",
      provisionalSummary:
        "Esta nota refleja solo lo que el evaluador pudo leer. Abajo se ve qué quedó documentado y qué no se pudo evaluar.",
      dimUnreadable: "No se pudo leer",
      dimUnreadableNote: "",
      notDemonstratedList: "No se pudo demostrar",
      notDemonstratedCap: "La evidencia sobre «{verb}» quedó incompleta: no demuestra que falte.",
      meaningIncomplete: "Con la evidencia recuperada:",
      meaningLowIncomplete: "Lo que se pudo leer muestra solo una parte de lo que el sistema publica en esta dimensión. No hay base para concluir que el sistema no publique {can}: parte de la evidencia quedó fuera del alcance de esta evaluación.",
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
          "Este Design System publica, en formatos recuperables por un agente, la mayor parte de lo que esta evaluación revisa: acceso, tokens, componentes, criterios de uso, patrones y documentación.",
        conclusion:
          "Nivel Operable según la evidencia publicada. Quedan puntos que un agente tendría que inferir porque el sistema no los expresa de forma explícita. Esta fase no comprueba cómo trabaja un agente con el sistema.",
        conclusionNoGaps:
          "Nivel Operable según la evidencia publicada: no se detectaron puntos importantes que un agente tuviera que inferir. Esta fase no comprueba cómo trabaja un agente con el sistema.",
      },
      Interpretable: {
        summary:
          "El sistema publica buena parte de lo que esta evaluación revisa, pero en varios puntos no expresa de forma explícita decisiones que un agente tendría que inferir.",
        conclusion:
          "Nivel Interpretable según la evidencia publicada: hay una base documental, con vacíos que un agente tendría que resolver por su cuenta.",
      },
      Legible: {
        summary:
          "El sistema publica parte de su documentación en un formato recuperable, pero falta información estructurada sobre cómo usarlo.",
        conclusion:
          "Nivel Legible según la evidencia publicada: muchas decisiones de uso no están documentadas y quedarían a criterio del agente.",
      },
      Opaco: {
        summary: "Casi no se encontró información del sistema en un formato recuperable por un agente.",
        conclusion:
          "Nivel Opaco según la evidencia publicada: el primer paso es publicar la información en un formato recuperable por agentes.",
      },
    },

    dims: {
      D1: {
        name: "Acceso",
        verb: "Descubrir",
        can: "acceso a la documentación y a la información estructurada",
        what:
          "Si la información que un agente necesita para trabajar con el Design System está publicada de forma que se pueda encontrar y recuperar mecánicamente: documentación, catálogo de componentes, propiedades y tipos, tokens e información estructurada.",
        purpose:
          "Un Design System puede tener excelente documentación y componentes perfectamente definidos, pero si esa información no es accesible para un agente, en la práctica el agente no puede utilizarla.",
        why:
          "Es la primera capacidad: descubrir. Antes de poder interpretar o utilizar un Design System, el agente tiene que poder llegar hasta él. Por eso, si el acceso es muy bajo, el resultado general queda limitado sin importar el resto.",
        meaning: {
          full: "La información revisada está publicada en formatos recuperables por un agente, sin depender de que alguien le indique dónde está.",
          high: "La mayor parte de la información revisada está en formatos recuperables; algunas piezas no lo están.",
          mid: "Parte de la información está en formatos recuperables, pero otras piezas importantes no. Un agente dependería más de que alguien se las indique.",
          low: "Casi no se encontró información en formatos recuperables por un agente. Sin acceso, lo demás que publique el sistema difícilmente se aprovecha.",
        },
      },
      D2: {
        name: "Tokens",
        verb: "Reutilizar",
        can: "decisiones visuales reutilizables (tokens)",
        what:
          "Si los valores visuales definidos por el Design System están publicados de forma que un agente los identifique y los reutilice: color, espaciado, tipografía, tamaños, etc.",
        purpose:
          "Los tokens permiten que las decisiones visuales del sistema estén expresadas de forma reutilizable y no dependan de valores inventados en cada interfaz.",
        why:
          "Un agente puede generar una interfaz visualmente plausible usando valores arbitrarios, y eso no significa que esté usando el Design System. Para trabajar de forma agentic, el agente debe poder reconocer: «el sistema ya tomó esta decisión; debo reutilizarla».",
        meaning: {
          full: "Los tokens revisados están publicados con su valor y su intención: un agente tendría con qué reutilizar las decisiones visuales en lugar de inventarlas.",
          high: "Los valores del sistema están publicados, pero en algunos casos no queda claro cuál corresponde a cada uso; un agente tendría que inferirlo.",
          mid: "Se encontró parte de los valores del sistema. En muchos casos un agente tendría que elegir sin saber cuál corresponde, o aproximar valores.",
          low: "No se encontraron los valores del sistema en un formato reutilizable. Sin ellos, lo esperable es que un agente genere valores parecidos, no los del sistema.",
        },
      },
      D3: {
        name: "Componentes y API",
        verb: "Utilizar",
        can: "configuración de los componentes (propiedades, tipos, variantes y estados)",
        what:
          "Si el Design System publica la información que un agente necesita para entender y usar sus componentes. No basta con encontrar un componente como Button: el agente debe entender qué propiedades tiene, qué valores acepta, qué variantes y estados existen, cuáles son sus valores por defecto y para qué sirve cada propiedad.",
        purpose:
          "Sirve para revisar si los componentes publican lo que un sistema que trabaja de forma autónoma necesitaría para usarlos. Una persona puede preguntarle a otro diseñador «¿qué variante debería usar aquí?»; un agente no necesariamente tiene esa posibilidad. La información tiene que estar en el propio sistema.",
        why:
          "Un agente puede generar código sintácticamente válido sin usar correctamente el Design System. Si la API está incompleta o es ambigua, puede inventar valores, usar propiedades inexistentes, combinar variantes de forma incorrecta, ignorar estados o interpretar de manera diferente componentes parecidos.",
        meaning: {
          full: "Para los componentes revisados se publican propiedades, tipos, valores, variantes y estados: un agente no tendría que adivinar cómo configurarlos.",
          high: "La mayoría de los componentes revisados documenta su configuración. En algunos casos un agente tendría que inferir, y el riesgo es una implementación aparentemente correcta que usa la API de una forma que el sistema no contempla.",
          mid: "La configuración de los componentes está documentada solo en parte. Un agente tendría que adivinar con frecuencia propiedades, valores o estados.",
          low: "No se encontró cómo se configuran los componentes. Un agente podría nombrarlos, pero tendría que adivinar casi todo sobre su uso.",
        },
      },
      D4: {
        name: "Semántica",
        verb: "Decidir",
        can: "criterios para elegir cada componente",
        what:
          "Si el Design System explica para qué sirve cada componente, cuándo usarlo, cuándo no, qué no se debe hacer y cómo elegir entre componentes parecidos.",
        purpose:
          "La API dice cómo se usa un componente; la semántica dice cuándo corresponde usarlo. Es la diferencia entre un catálogo de piezas y un sistema con criterio.",
        why:
          "Sin criterios explícitos, un agente elige entre componentes técnicamente válidos sin fundamento: un modal donde correspondía una notificación, un checkbox donde iba un switch. El resultado funciona, pero no es la decisión que el sistema habría tomado.",
        meaning: {
          full: "Se publican criterios explícitos para elegir cada componente, cuándo no usarlo y qué evitar.",
          high: "Hay criterios publicados para la mayoría de las decisiones de uso; las que faltan quedarían a criterio del agente.",
          mid: "Se publica para qué sirven varios componentes, pero muchas decisiones de uso no están documentadas.",
          low: "No se encontraron criterios para decidir cuándo usar cada componente. Sin ellos, lo esperable es que un agente elija por parecido, no por intención de diseño.",
        },
      },
      D5: {
        name: "Patrones",
        verb: "Componer",
        can: "reglas para combinar componentes",
        what:
          "Si el Design System documenta cómo se combinan los componentes: patrones (formularios, tablas, páginas), reglas de composición, qué puede ir dentro de qué, y la distribución y los espacios entre elementos.",
        purpose:
          "Las pantallas reales no se construyen con un componente aislado. Los patrones capturan decisiones que el equipo ya tomó sobre cómo se arman las cosas.",
        why:
          "Un agente que sabe usar cada componente por separado puede, igualmente, armar pantallas incoherentes. Para componer de forma autónoma necesita reglas explícitas de combinación.",
        meaning: {
          full: "Se publican patrones y reglas de composición para combinar componentes.",
          high: "Hay patrones publicados para la mayoría de los casos; algunas combinaciones tendría que inferirlas el agente.",
          mid: "Se encontraron algunos patrones, pero muchas decisiones de composición no están documentadas.",
          low: "No se encontraron patrones ni reglas de composición. Un agente armaría las pantallas por intuición, no siguiendo el sistema.",
        },
      },
      D6: {
        name: "Documentación",
        verb: "Resolver",
        can: "contexto y ejemplos de uso",
        what:
          "Cuánta documentación recuperable hay —descripciones, ejemplos de código, explicación de variantes y estados, accesibilidad y versiones— para que un agente tenga contexto al tomar decisiones.",
        purpose:
          "La documentación es el contexto que acompaña a las piezas: explica, muestra ejemplos y ayuda a resolver casos que la API no cubre por sí sola.",
        why:
          "Cuando algo no está claro, una persona pregunta o busca un ejemplo. Un agente solo cuenta con lo que el sistema publica. Sin ejemplos ni explicaciones, resuelve las dudas adivinando.",
        meaning: {
          full: "Se publican descripciones, ejemplos y explicaciones para los componentes revisados.",
          high: "La documentación cubre la mayoría de los casos revisados; algunas dudas no tendrían respuesta en lo publicado.",
          mid: "La documentación cubre parte del sistema; muchas dudas quedarían sin ejemplos ni explicaciones.",
          low: "Casi no se encontró documentación ni ejemplos. Un agente tendría que resolver la mayoría de las dudas por su cuenta.",
        },
      },
      D7: {
        name: "Consistencia Design–Code",
        verb: "Verificar",
        can: "correspondencia entre diseño y código",
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
      agent_manifest: { name: "Manifiesto para agentes", found: "un archivo llms.txt o AGENTS.md publicado en el sitio (se verifica que exista; no se revisa su contenido)", gap: "No se encontró un manifiesto para agentes (llms.txt o AGENTS.md).", infer: "por dónde empezar a recorrer el sistema", fix: "Agregar un archivo llms.txt en la raíz del sitio: un índice breve, en texto, que le indica a un agente dónde está cada cosa." },
      agent_interface: { name: "Interfaz para agentes", found: "un servidor MCP u otra API publicada para agentes (se detecta que existe o que la documentación lo menciona; no se comprueba que se pueda consultar)", gap: "No se encontró una interfaz directa para agentes (por ejemplo, un servidor MCP).", infer: "cómo consultar el sistema sin recorrer páginas web", fix: "Ofrecer un servidor MCP u otra interfaz para que los agentes consulten el sistema directamente." },

      tokens_identifiable: { name: "Tokens identificables", found: "al menos un archivo o sección donde los valores visuales (colores, espaciados, etc.) tengan un nombre propio, no solo números sueltos dentro del CSS", gap: "No se encontraron tokens identificables.", infer: "qué valores visuales define el sistema", fix: "Expresar las decisiones visuales como tokens con nombre, no como valores sueltos." },
      structured_format: { name: "Formato estructurado", found: "los tokens exportados como datos (JSON o YAML), no solo como variables CSS o Sass", gap: "Los tokens no están en un formato estructurado.", infer: "cómo leer los tokens", fix: "Exportar los tokens en un formato estándar, idealmente W3C Design Tokens (DTCG)." },
      naming_consistency: { name: "Consistencia de nombres", found: "que los nombres de los tokens usen el punto como separador de forma pareja: casi todos con punto (color.primary) o casi todos sin punto. Es una revisión limitada: no comprueba si siguen un mismo patrón de partes ni un mismo estilo (guiones, camelCase)", gap: "Los nombres de los tokens mezclan nombres con punto y sin punto.", infer: "cómo se llaman los tokens que no vio", fix: "Usar el mismo separador en los nombres de todos los tokens." },
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
      api_consistency: { name: "Repetición de nombres de propiedades", found: "nombres de propiedad que se repiten entre componentes (por ejemplo, size en varios). Es una señal indirecta: no comprueba si un mismo concepto usa nombres distintos (type en uno, kind en otro), y un sistema con propiedades muy especializadas puede puntuar bajo sin ser inconsistente", gap: "Pocos nombres de propiedad se repiten entre los componentes revisados; esto por sí solo no prueba que la API sea inconsistente.", infer: "algunas convenciones de API", fix: "Revisar si un mismo concepto tiene nombres distintos en distintos componentes y, si es así, unificarlos." },
      prop_purpose: { name: "Propósito de las propiedades", found: "una frase breve junto a cada propiedad que explique para qué sirve, no solo su nombre y tipo", gap: "No siempre se explica para qué sirve cada propiedad.", infer: "para qué sirven algunas propiedades", fix: "Agregar una descripción breve del propósito de cada propiedad." },

      purpose_identification: { name: "Propósito del componente", found: "una frase al inicio de cada componente que explique para qué sirve", gap: "No todos los componentes declaran para qué sirven.", infer: "para qué sirven algunos componentes", fix: "Empezar cada página de componente con una frase que diga para qué sirve." },
      component_selection: { name: "Cuándo usarlo", found: "una sección que diga en qué situaciones concretas corresponde usar el componente", gap: "No todos los componentes indican explícitamente cuándo usarlos.", infer: "cuándo usar cada componente", fix: "Agregar a cada componente una sección «Cuándo usarlo» con casos concretos." },
      disambiguation: { name: "Desambiguación", found: "una regla explícita que compare dos componentes parecidos y diga cuándo usar cada uno (por ejemplo, «usa Modal cuando..., usa Drawer cuando...»)", gap: "Hay componentes parecidos sin un criterio documentado para elegir entre ellos.", infer: "cómo elegir entre componentes parecidos", fix: "Explicar cuándo elegir cada uno de los componentes que se parecen (por ejemplo, modal o notificación).", na: "No se detectaron componentes parecidos entre sí, así que no hubo nada que desambiguar." },
      restrictions: { name: "Restricciones de uso", found: "frases explícitas del tipo «no hagas X» o «evita Y» junto a cada componente", gap: "No todos los componentes documentan restricciones de uso (qué no hacer).", infer: "algunas restricciones de uso", fix: "Agregar reglas concretas de lo que no se debe hacer con cada componente." },
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
        "The score measures how much of what an agent would need to discover, understand and use the system is published in a retrievable format. It's based on what's published; it doesn't put an agent to work on tasks. It isn't a measure of the Design System's quality for people.",
      gate:
        "Access (D1) is very low, so the overall result is capped at 40 regardless of the other dimensions: if an agent can't reach the information, nothing else can be put to use.",
      liveCaveat:
        "Some parts of the system couldn't be read from the site (see “Limitations”), so this result may underestimate the Design System.",
      canDo: "Well documented",
      mayInfer: "What an agent would still have to infer",
      cannot: "Little published evidence",
      notEvaluated: "Couldn't be evaluated",
      therefore: "In short:",
      expected: "Expected to find:",
      chainTitle: "What an agent needs",
      chainLead: "Each dimension checks whether the system publishes what an agent would need for one capability, from the most basic to the most advanced. What's published is reviewed; no agent is put to work on tasks.",
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
      capability: "Related capability",
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
        "no properties were found to compare across components. This criterion is left out of the score (it doesn't count as 0) and doesn't mean the API is inconsistent.",
      stNone: "no evidence",
      meaningCaveat: "Based on the information that could be read:",
      certDemonstrated: "Found",
      certPartial: "Partly found",
      certNotDemonstrated: "Not found",
      certAbsent: "Doesn't exist",
      certNotEvaluated: "Couldn't be read",
      certNA: "Not applicable",
      certScope: "Outside this phase",
      grpScope: "Outside the scope of this phase (not part of the score):",
      rsNoPairs:
        "this version doesn't detect separately which components are similar, so it doesn't know which ones would need a rule for choosing between them. Disambiguation sentences it finds are recorded as evidence, but they aren't scored.",
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
      incompleteWhy: "Why it's incomplete ({n})",
      howTitle: "How this evaluation was done",
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
        "The server only keeps your result for a few minutes: download it to save it. For the PDF, choose “Save as PDF”.",
      coverageVaries:
        "The number of pages read can vary from one evaluation of the same site to another, especially on slow sites or when the time limit is reached. So two evaluations may give somewhat different results. “What we reviewed” lists what was read in this one.",
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
      roleAdapter: "same page in a machine-readable format",
      roleOfficialRead: "official source linked by the system",
      usedComponentIndex: "component index from Storybook ({n} components listed)",
      usedRecovered: "the page came back empty (built with JavaScript); the content was read from here",
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
      rateQ: "What do you think of this result?",
      rateSub: "Your feedback helps improve Agentic DS.",
      rateCta: "Rate this result",
      limAgentFiles:
        "Detecting an MCP server, an API, an llms.txt or an AGENTS.md only confirms that they exist or that the documentation mentions them. The evaluator doesn't check whether they're accessible, whether they work, or whether they require credentials.",
      limNoContradictions:
        "This version doesn't look for contradictions between sources (for example, between a page and a token file). The report showing no contradictions doesn't mean there are none.",
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
      discRendered: "This site only shows its content with JavaScript: to read it we loaded {n} page(s) in a browser. Many agents don't run JavaScript, which is why it counts in Access (D1).",
      rJsUnavailable: "this site builds its content with JavaScript and the evaluator's browser was not available, so those pages couldn't be read",
      rJsPartial: "{n} page(s) that build their content with JavaScript couldn't be opened (ran out of time or failed to load)",
      officialKind: { storybook: "Storybook", repository: "code repository", package: "published package" },
      provisionalLead:
        "Only {pct}% of what makes up the score could be reviewed. With less than half we don't assign a level: the number reflects what was reviewed, but it isn't enough for a conclusion.",
      provisionalSummary:
        "This score only reflects what the evaluator could read. Below is what was found documented and what couldn't be evaluated.",
      dimUnreadable: "Couldn't be read",
      dimUnreadableNote: "",
      notDemonstratedList: "Couldn't be demonstrated",
      notDemonstratedCap: "The evidence on “{verb}” is incomplete: it doesn't show that it's missing.",
      meaningIncomplete: "Based on the retrieved evidence:",
      meaningLowIncomplete: "What could be read shows only part of what the system publishes in this dimension. There's no basis to conclude that the system doesn't publish {can}: some of the evidence was out of reach for this evaluation.",
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
          "This Design System publishes, in formats retrievable by an agent, most of what this evaluation reviews: access, tokens, components, usage criteria, patterns and documentation.",
        conclusion:
          "Operable level based on the published evidence. There are still points an agent would have to infer because the system doesn't state them explicitly. This phase doesn't test how an agent actually works with the system.",
        conclusionNoGaps:
          "Operable level based on the published evidence: no important points were detected that an agent would have to infer. This phase doesn't test how an agent actually works with the system.",
      },
      Interpretable: {
        summary:
          "The system publishes a good part of what this evaluation reviews, but at several points it doesn't explicitly state decisions an agent would have to infer.",
        conclusion:
          "Interpretable level based on the published evidence: there is a documentary base, with gaps an agent would have to resolve on its own.",
      },
      Legible: {
        summary:
          "The system publishes part of its documentation in a retrievable format, but structured information on how to use it is missing.",
        conclusion:
          "Legible level based on the published evidence: many usage decisions aren't documented and would be left to the agent's judgment.",
      },
      Opaco: {
        summary: "Almost no information about the system was found in a format retrievable by an agent.",
        conclusion:
          "Opaque level based on the published evidence: the first step is to publish the information in a format retrievable by agents.",
      },
    },

    dims: {
      D1: {
        name: "Access", verb: "Discover", can: "access to the documentation and structured information",
        what: "Whether the information an agent needs to work with the Design System is published in a form that is mechanically findable and retrievable: documentation, component catalog, properties and types, tokens and structured information.",
        purpose: "A Design System can have excellent documentation and perfectly defined components, but if that information isn't accessible to an agent, in practice the agent can't use it.",
        why: "It's the first capability: discovering. Before an agent can interpret or use a Design System, it has to be able to reach it. That's why, if access is very low, the overall result is capped regardless of everything else.",
        meaning: {
          full: "The reviewed information is published in formats retrievable by an agent, without depending on someone to point out where it is.",
          high: "Most of the reviewed information is in retrievable formats; some pieces aren't.",
          mid: "Part of the information is in retrievable formats, but other important pieces aren't. An agent would depend more on someone pointing the way.",
          low: "Almost no information was found in formats retrievable by an agent. Without access, whatever else the system publishes is hard to put to use.",
        },
      },
      D2: {
        name: "Tokens", verb: "Reuse", can: "reusable visual decisions (tokens)",
        what: "Whether the visual values defined by the Design System are published in a form an agent could identify and reuse: color, spacing, typography, sizing, etc.",
        purpose: "Tokens let the system's visual decisions be expressed in a reusable way, instead of depending on values invented for each interface.",
        why: "An agent can produce a visually plausible interface using arbitrary values, and that doesn't mean it's using the Design System. To work agentically, it must be able to recognize: “the system already made this decision; I should reuse it.”",
        meaning: {
          full: "The reviewed tokens are published with their value and intent: an agent would have what it needs to reuse the visual decisions instead of inventing them.",
          high: "The system's values are published, but in some cases it isn't clear which one fits each use; an agent would have to infer it.",
          mid: "Part of the system's values were found. In many cases an agent would have to choose without knowing which one applies, or approximate values.",
          low: "The system's values weren't found in a reusable format. Without them, an agent would most likely generate similar values, not the system's own.",
        },
      },
      D3: {
        name: "Components & API", verb: "Use", can: "component configuration (properties, types, variants and states)",
        what: "Whether the Design System publishes the information an agent needs to understand and use its components. Finding a component like Button isn't enough: the agent must understand its properties, accepted values, variants and states, defaults, and what each property is for.",
        purpose: "It checks whether the components publish what a system working autonomously would need to use them. A person can ask another designer “which variant should I use here?”; an agent may not have that option. The information has to live in the system itself.",
        why: "An agent can generate syntactically valid code without using the Design System correctly. If the API is incomplete or ambiguous, it may invent values, use properties that don't exist, combine variants incorrectly, ignore states, or read similar components differently.",
        meaning: {
          full: "For the reviewed components, properties, types, values, variants and states are published: an agent wouldn't have to guess how to configure them.",
          high: "Most reviewed components document their configuration. In some cases an agent would have to infer, and the risk is a seemingly correct implementation that uses the API in a way the system doesn't intend.",
          mid: "Component configuration is only partly documented. An agent would often have to guess properties, values or states.",
          low: "No documentation was found on how components are configured. An agent could name them, but would have to guess almost everything about using them.",
        },
      },
      D4: {
        name: "Semantics", verb: "Decide", can: "criteria for choosing each component",
        what: "Whether the Design System explains what each component is for, when to use it, when not to, what to avoid, and how to choose between similar components.",
        purpose: "The API says how to use a component; semantics says when it's the right one. It's the difference between a catalog of parts and a system with judgment.",
        why: "Without explicit criteria, an agent chooses between technically valid components without grounds: a modal where a notification belonged, a checkbox where a switch should go. The result works, but it isn't the decision the system would have made.",
        meaning: {
          full: "Explicit criteria are published for choosing each component, when not to use it, and what to avoid.",
          high: "Criteria are published for most usage decisions; the missing ones would be left to the agent's judgment.",
          mid: "What several components are for is published, but many usage decisions aren't documented.",
          low: "No criteria were found for when to use each component. Without them, an agent would likely choose by resemblance, not by design intent.",
        },
      },
      D5: {
        name: "Patterns", verb: "Compose", can: "rules for combining components",
        what: "Whether the Design System documents how components combine: patterns (forms, tables, pages), composition rules, what can go inside what, and layout and spacing between elements.",
        purpose: "Real screens aren't built from a single component. Patterns capture decisions the team has already made about how things are put together.",
        why: "An agent that knows how to use each component on its own can still assemble incoherent screens. To compose autonomously it needs explicit rules for combining them.",
        meaning: {
          full: "Patterns and composition rules for combining components are published.",
          high: "Patterns are published for most cases; an agent would have to infer some combinations.",
          mid: "Some patterns were found, but many composition decisions aren't documented.",
          low: "No patterns or composition rules were found. An agent would assemble screens by intuition, not by following the system.",
        },
      },
      D6: {
        name: "Documentation", verb: "Resolve", can: "context and usage examples",
        what: "How much retrievable documentation there is —descriptions, code examples, explanations of variants and states, accessibility and versions— for an agent to have context when making decisions.",
        purpose: "Documentation is the context around the parts: it explains, shows examples, and helps resolve cases the API doesn't cover on its own.",
        why: "When something is unclear, a person asks or looks for an example. An agent only has what the system publishes. Without examples or explanations, it resolves doubts by guessing.",
        meaning: {
          full: "Descriptions, examples and explanations are published for the reviewed components.",
          high: "The documentation covers most of the reviewed cases; some questions wouldn't find an answer in what's published.",
          mid: "The documentation covers part of the system; many questions would lack examples or explanations.",
          low: "Almost no documentation or examples were found. An agent would have to resolve most questions on its own.",
        },
      },
      D7: {
        name: "Design–Code consistency", verb: "Verify", can: "design–code correspondence",
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
      agent_manifest: { name: "Agent manifest", found: "an llms.txt or AGENTS.md file published on the site (its existence is checked; its content isn't reviewed)", gap: "No agent manifest was found (llms.txt or AGENTS.md).", infer: "where to start exploring the system", fix: "Add an llms.txt file at the site root: a short text index that tells an agent where everything is." },
      agent_interface: { name: "Agent interface", found: "an MCP server or other API published for agents (its existence or a mention in the documentation is detected; whether it can actually be queried isn't checked)", gap: "No direct interface for agents was found (for example, an MCP server).", infer: "how to query the system without crawling web pages", fix: "Offer an MCP server or another interface so agents can query the system directly." },

      tokens_identifiable: { name: "Identifiable tokens", found: "at least one file or section where visual values (colors, spacing, etc.) have a proper name, not just loose numbers in the CSS", gap: "No identifiable tokens were found.", infer: "which visual values the system defines", fix: "Express visual decisions as named tokens, not loose values." },
      structured_format: { name: "Structured format", found: "tokens exported as data (JSON or YAML), not only as CSS or Sass variables", gap: "Tokens aren't in a structured format.", infer: "how to read the tokens", fix: "Export tokens in a standard format, ideally W3C Design Tokens (DTCG)." },
      naming_consistency: { name: "Naming consistency", found: "token names using the dot as a separator evenly: almost all with a dot (color.primary) or almost all without. It's a limited check: it doesn't verify that names follow the same pattern of parts or the same style (hyphens, camelCase)", gap: "Token names mix names with and without dots.", infer: "what tokens it hasn't seen are called", fix: "Use the same separator in every token name." },
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
      api_consistency: { name: "Repeated property names", found: "property names that repeat across components (for example, size on several). It's an indirect signal: it doesn't verify whether one concept uses different names (type on one, kind on another), and a system with very specialized properties may score low without being inconsistent", gap: "Few property names repeat across the reviewed components; that alone doesn't prove the API is inconsistent.", infer: "some API conventions", fix: "Check whether one concept has different names on different components and, if so, unify them." },
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

  // Solo para informes guardados antes de que el motor incluyera
  // readiness_levels. Debe ser igual a engine/config/rules.json
  // (tests/report-claims.test.js lo comprueba).
  const LEVELS_FALLBACK = [
    { min: 0, max: 24, label: "Opaco" },
    { min: 25, max: 49, label: "Legible" },
    { min: 50, max: 74, label: "Interpretable" },
    { min: 75, max: 100, label: "Operable" },
  ];

  window.AgenticDSReport = { es, en, WEIGHTS, LEVELS_FALLBACK };
})();
