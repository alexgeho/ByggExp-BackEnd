module.exports = {
  apps: [
    {
      name: 'byggexp-api',
      script: './dist/src/main.js',
      node_args: '--env-file=/opt/byggexp-api/shared/.env',
      cwd: '/opt/byggexp-api/current',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '700M',
      error_file: '/var/log/byggexp-api/error.log',
      out_file: '/var/log/byggexp-api/out.log',
      merge_logs: true,
      time: true,
      kill_timeout: 10000,
      listen_timeout: 30000,
      wait_ready: false,
    },
  ],
}
