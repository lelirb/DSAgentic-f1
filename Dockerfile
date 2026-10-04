# Imagen del servidor con Chromium instalado.
#
# Por qué Docker: para leer sitios que arman su contenido con JavaScript hace
# falta un navegador, y el entorno Node estándar de Render no trae uno ni permite
# instalar paquetes del sistema. La app no tiene dependencias de npm: no hay
# "npm install" que correr.
FROM node:22-bookworm-slim

# chromium trae todas las bibliotecas que necesita. Si el repositorio ofrece la
# variante sin interfaz gráfica (usa menos memoria), se instala también y la app
# la prefiere. Si no existe, se sigue sin ella.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates tini \
 && (apt-get install -y --no-install-recommends chromium-headless-shell || true) \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node . .

# Sin privilegios de administrador dentro del contenedor.
USER node

# tini es el primer proceso del contenedor: retira los procesos auxiliares de
# Chromium que ya terminaron (si no, se acumulan como "zombis") y reenvía a Node
# la señal de apagado.
ENTRYPOINT ["/usr/bin/tini", "--"]

# Render define PORT; server.js lo lee.
CMD ["node", "server.js"]
