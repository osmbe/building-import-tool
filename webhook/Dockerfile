FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        gnupg \
        postgresql-client \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

COPY server.py /server.py
COPY restore-osm.sh /restore-osm.sh
COPY restore-grb.sh /restore-grb.sh
COPY restore-picc.sh /restore-picc.sh
RUN chmod +x /restore-osm.sh /restore-grb.sh /restore-picc.sh

EXPOSE 9000
CMD ["python", "/server.py"]
