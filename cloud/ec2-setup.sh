#!/usr/bin/env bash
# One-time server prep for Ubuntu 22.04 on EC2. Run as the normal ubuntu user.
set -euo pipefail

curl -fsSL https://get.docker.com | sudo sh        # installs Docker + the compose plugin
sudo usermod -aG docker "$USER"
sudo snap install aws-cli --classic

# 2 GB swap: a safety net for TensorFlow's memory spike while the model loads.
if ! swapon --show | grep -q swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

sudo mkdir -p /opt/smartvision/models
sudo chown -R "$USER": /opt/smartvision

echo "Done. Log out and back in once so the docker group takes effect."
