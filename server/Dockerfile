# HVAS backend — zero-dependency Node 22 (no npm install needed).
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV PORT=8787 HVAS_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
# Mesh port is optional (set MESH_PORT / MESH_PEERS to cluster nodes).
CMD ["node", "src/index.mjs"]
