# Agent Tasks

1. csvpilot doctor -c .csvpilot/agent.config.yaml
2. csvpilot plan -c .csvpilot/agent.config.yaml --format json
3. csvpilot run -c .csvpilot/agent.config.yaml
4. csvpilot verify --actual sample/output --spec .csvpilot/verify.spec.yaml