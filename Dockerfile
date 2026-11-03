# LabPilot - 前端静态站点 + 摘要 API 的服务端
# 项目零第三方依赖（没有 npm install），所以镜像非常小，构建也快。
FROM node:22-alpine

WORKDIR /app

# 容器内必须监听 0.0.0.0，否则宿主机映射端口进不来
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

# 只拷贝运行必需的文件（零依赖，无需 node_modules）
COPY package.json ./
COPY server ./server
COPY index.html app.js styles.css ./
COPY assets ./assets

# 以非 root 运行
RUN addgroup -S app && adduser -S app -G app \
    && chown -R app:app /app
USER app

EXPOSE 8080

# 只要 HTTP 200 就算健康；Ollama 掉线时接口仍返回 200 并自动降级，不应判为不健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
