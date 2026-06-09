FROM coturn/coturn:alpine

USER root
RUN apk add --no-cache gettext curl

COPY turnserver.conf.template /etc/turnserver.conf.template
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
