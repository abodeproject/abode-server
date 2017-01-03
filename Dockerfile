FROM fedora:latest

RUN dnf update -y
RUN dnf install -y nodejs

RUN mkdir -p /app /data /data/logs; \
    useradd abode; \
    touch /data/config.ini; \
    chown -R abode /data/

ENV ABODE_CONFIG=/data/config.ini \
	ABODE_MODE=server \
	ABODE_ACCESS_LOGS=console \
	ABODE_WEB_ADDRESS=0.0.0.0

COPY . app/

EXPOSE 8080
USER abode

CMD cd /app && /usr/bin/node /app/index.js
