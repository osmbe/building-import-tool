FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gnupg \
        postgresql-client \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
        | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian bookworm stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y gh docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

COPY server.py /server.py
COPY restore-osm.sh /restore-osm.sh
COPY restore-grb.sh /restore-grb.sh
COPY restore-picc.sh /restore-picc.sh
COPY deploy-nuxt.sh /deploy-nuxt.sh
COPY import-osm.sh /import-osm.sh
COPY import-grb.sh /import-grb.sh
COPY import-picc.sh /import-picc.sh
RUN chmod +x /restore-osm.sh /restore-grb.sh /restore-picc.sh /deploy-nuxt.sh \
    /import-osm.sh /import-grb.sh /import-picc.sh

EXPOSE 9000
CMD ["python", "/server.py"]
