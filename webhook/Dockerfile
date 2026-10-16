# Webhook server image: python for server.py, plus the tools the job scripts use (psql, gh, docker CLI with
# compose, git, jq, flock from util-linux). The job scripts are not baked in: server.py runs them from the
# mounted checkout (<COMPOSE_PROJECT_DIR>/webhook), so they always match the deployed code.
FROM python:3.15-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        git \
        jq \
        gnupg \
        postgresql-client \
        util-linux \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        > /etc/apt/sources.list.d/github-cli.list \
    && curl -fsSL https://download.docker.com/linux/debian/gpg \
        | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
        > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y --no-install-recommends gh docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

COPY server.py /server.py

EXPOSE 9000
CMD ["python", "/server.py"]
