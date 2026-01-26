# BE2OSM Ansible Playbook

Automates the creation of a temporary Digital Ocean VM to run OSM and GRB data imports, then transfers the database dumps back to the main VPS.

## Architecture

```
┌─────────────────────────────┐     ┌──────────────────────────────────┐
│  Lightweight VPS (Debian)   │────▶│  DO Processing VM (temporary)    │
│  - Frontend (Nuxt)          │     │  - PostgreSQL container          │
│  - Martin tile servers      │     │  - Processing container          │
│  - Cron jobs                │     │  - OSM + GRB import              │
│  - Ansible (runs playbook)  │     │  - pg_dump → .sql.gz             │
└─────────────────────────────┘◀────└──────────────────────────────────┘
        (receives dumps and restores to local DB)
```

## Prerequisites

### 1. Install Ansible (on your lightweight VPS)

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install -y ansible

# Or with pip
pip install ansible
```

### 2. Install Ansible Collections

```bash
cd ansible/
ansible-galaxy collection install -r requirements.yml
```

### 3. Set Environment Variables

```bash
# Digital Ocean API Token
# Get from: https://cloud.digitalocean.com/account/api/tokens
export DO_API_TOKEN="your-do-api-token"

# Digital Vlaanderen API Key (for GRB data)
export DIGITAL_VLAANDEREN_API_KEY="your-api-key"
```

### 4. Register SSH Key with Digital Ocean

Your SSH key must be registered with DO so you can connect to the droplet.

```bash
# Check if you have a key
cat ~/.ssh/id_ed25519.pub

# Register it at: https://cloud.digitalocean.com/account/security
```

### 5. SSH Agent

Needed for connecting to the DO processing VM.

```bash
# Start SSH agent
eval "$(ssh-agent -s)"

# Add your key
ssh-add ~/.ssh/id_ed25519
```

## Usage

### Full Run (recommended)

```bash
cd /opt/be2osm/ansible/

# Run everything: create VM → import data → transfer dumps → destroy VM
# Dumps are fetched back to this VPS at target_path
ansible-playbook playbook.yml -e "target_path=/opt/be2osm/data/backups"
```

### Run Specific Phases

```bash
# Just create the VM
ansible-playbook playbook.yml --tags create

# Just run the imports (VM must exist)
ansible-playbook playbook.yml --tags process

# Just transfer dumps (VM must exist with completed imports)
ansible-playbook playbook.yml --tags transfer -e "target_path=/opt/be2osm/data/backups"

# Just destroy the VM
ansible-playbook playbook.yml --tags destroy
```

### Keep VM for Debugging

```bash
# Skip the destroy step
ansible-playbook playbook.yml --skip-tags destroy -e "target_path=/opt/be2osm/data/backups"

# Later, destroy manually
ansible-playbook playbook.yml --tags destroy
```

### Verbose Output

```bash
ansible-playbook playbook.yml -v -e "target_path=..."   # Some detail
ansible-playbook playbook.yml -vv -e "target_path=..."  # More detail
ansible-playbook playbook.yml -vvv -e "target_path=..." # Full debug
```

## Configuration

Edit `vars.yml` to customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `do_droplet_size` | `s-8vcpu-16gb` | VM size (8 vCPU, 16GB RAM) |
| `do_droplet_region` | `ams3` | Amsterdam datacenter |
| `do_droplet_image` | `debian-12-x64` | OS image |

## Troubleshooting

### "No SSH keys found"

Register your SSH key with Digital Ocean at https://cloud.digitalocean.com/account/security

### "Connection refused" to VM

Wait a bit longer - the droplet might still be initializing. The playbook includes waits, but you can increase them in `roles/droplet/tasks/main.yml`.

### Resume after failure

Ansible is idempotent - you can re-run the playbook and it will skip completed steps. Use `--start-at-task="Task name"` to start from a specific task.

## File Structure

```
ansible/
├── playbook.yml          # Main orchestration
├── vars.yml              # Configuration variables
├── inventory.yml         # Host definitions
├── ansible.cfg           # Ansible settings
├── requirements.yml      # Galaxy dependencies
├── README.md             # This file
└── roles/
    ├── droplet/          # Create/destroy DO VM
    ├── bootstrap/        # Install Docker, copy minimal files
    │   └── templates/
    │       ├── docker-compose.yml.j2  # Minimal compose (postgres + processing only)
    │       └── env.j2                 # Environment file
    ├── processing/       # Run OSM + GRB imports
    └── transfer/         # Dump + fetch files back
```

## How It Works

The playbook does NOT clone the full repository. Instead, it copies only the necessary files from your lightweight VPS to the processing VM:

- `docker-compose.yml` (minimal version with postgres + processing)
- `postgres/*.sql` (database init scripts)
- `processing/Dockerfile`
- `processing/justfile`
- `processing/config/*` (imposm mapping)
- `processing/sql/*` (transform scripts)

The processing container then downloads data directly from:
- **OSM**: Geofabrik (belgium-latest.osm.pbf)
- **GRB**: Digital Vlaanderen API
