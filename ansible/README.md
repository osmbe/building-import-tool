# BE2OSM Ansible Deployment

Automated deployment of BE2OSM on a fresh VPS using Ansible.

## Prerequisites

### Local Machine
- Ansible 2.14+ (`pip install ansible`)
- SSH access to your VPS

### VPS Requirements
- Ubuntu 22.04 LTS or newer
- SSH access (root or sudo user)
- Public IP address
- Domain pointing to the VPS

## Quick Start

### 1. Install Ansible Dependencies

```bash
cd ansible
ansible-galaxy install -r requirements.yml
```

### 2. Configure Inventory

```bash
cp inventory.yml.example inventory.yml
# Edit inventory.yml with your VPS IP
```

### 3. Configure Variables

```bash
cp group_vars/all.yml.example group_vars/all.yml
# Edit group_vars/all.yml with your settings
```

**Required variables:**
- `domain`: Your domain name (e.g., `be2osm.example.com`)
- `postgres_user`: Database username
- `postgres_password`: Strong database password
- `jwt_secret`: Random 32+ character string
- `osm_client_id`: From OSM OAuth registration
- `osm_client_secret`: From OSM OAuth registration
- `git_repo`: Your BE2OSM repository URL

### 4. Run Deployment

```bash
ansible-playbook site.yml
```

## What Gets Installed

The playbook configures:

1. **System Setup (common role)**
   - System updates and essential packages
   - UFW firewall (ports 22, 80, 443)
   - Fail2ban for SSH protection
   - Deploy user with sudo access

2. **Docker (docker role)**
   - Docker CE with Docker Compose plugin
   - Docker network for BE2OSM

3. **Application (app role)**
   - Git clone of BE2OSM repository
   - Environment configuration
   - Production Caddyfile with HTTPS
   - Docker Compose stack startup

## Services Deployed

| Service | Description | Port |
|---------|-------------|------|
| postgres | PostgreSQL 18 + PostGIS 3.5 | 5432 (internal) |
| nuxt-app | Nuxt 3 application | 3000 (internal) |
| grb-tiles | Martin tile server (GRB) | 3001 (internal) |
| osm-tiles | Martin tile server (OSM) | 3002 (internal) |
| caddy | Reverse proxy with HTTPS | 80, 443 |

## Post-Deployment

### Import Data

After deployment, SSH into the server and import data:

```bash
ssh deploy@your-vps-ip
cd /opt/be2osm

# Import OSM data
docker compose --profile processing run --rm task import-osm

# Import GRB data (requires API key)
docker compose --profile processing run --rm task --justfile grb-justfile import-full
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f nuxt-app
docker compose logs -f postgres
```

### Restart Services

```bash
docker compose restart nuxt-app
docker compose down && docker compose up -d
```

## Directory Structure

```
/opt/be2osm/
├── .env                    # Environment configuration
├── docker-compose.yml      # Main compose file
├── docker-compose.prod.yml # Production overrides
├── caddy/
│   └── Caddyfile.prod      # Production Caddy config
├── config/martin/          # Martin tile server configs
├── processing/
│   ├── data/               # Downloaded data files
│   └── logs/               # Processing logs
└── postgres/               # Database init scripts
```

## Troubleshooting

### Check service health
```bash
docker compose ps
docker compose logs postgres
```

### Database connection
```bash
docker compose exec postgres psql -U be2osm -d be2osm
```

### Rebuild Nuxt app
```bash
docker compose build nuxt-app
docker compose up -d nuxt-app
```

### SSL certificate issues
Caddy automatically obtains Let's Encrypt certificates. If issues occur:
```bash
docker compose logs caddy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Security Notes

- Never commit `group_vars/all.yml` or `inventory.yml` with real credentials
- Use strong passwords (32+ characters recommended)
- The firewall only allows SSH, HTTP, and HTTPS
- Fail2ban protects against SSH brute force attacks
- Database is not exposed externally

## Updating

To update the application:

```bash
ansible-playbook site.yml
```

This will:
1. Pull the latest code from git
2. Rebuild Docker images if needed
3. Restart services
