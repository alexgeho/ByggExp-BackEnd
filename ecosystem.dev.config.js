// DEV API (https://dev-api.byggexp.se), deployed from branch `dev`.
// Its own .env (base ByggExp_dev, PORT=3005) lives in /opt/byggexp-api-dev/shared.
module.exports = {
  apps: [
    {
      name: 'byggexp-api-dev',
      script: './dist/src/main.js',
      node_args: '--env-file=/opt/byggexp-api-dev/shared/.env',
      cwd: '/opt/byggexp-api-dev/current',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '500M',
      error_file: '/var/log/byggexp-api-dev/error.log',
      out_file: '/var/log/byggexp-api-dev/out.log',
      merge_logs: true,
      time: true,
      kill_timeout: 10000,
      listen_timeout: 30000,
      wait_ready: false,
    },
  ],
}
