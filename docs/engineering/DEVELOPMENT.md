# Start development from this handoff
1. Clone/pull main and run the two verification scripts in README.
2. Review current assets and read PRODUCT, ARCHITECTURE and BACKLOG.
3. Install Git, a supported Node LTS and Python version after checking the selected tool releases. Docker is optional for local services. Do not install multiple model runtimes before choosing the first inference path.
4. Choose cloud vs local development services. Create dev-only credentials and copy .env.example to an ignored local environment file. The example is documentation, not a running configuration.
5. Create apps/web, services/api and services/worker in the first implementation change, with lockfiles, health checks and CI. No such services exist yet.
6. Build upload → reviewed captions → export. Add one real integration at a time and keep mock states labelled.
7. Before enabling paid usage, reconcile complete variable costs, provider fees, VAT, trial limits and user-visible pricing.
8. Add provider adapters only behind explicit capability/configuration checks. Do not treat a configured model name as evidence that it supports isiZulu.

The project currently has no installable application package, Docker Compose stack or migration scripts. This is intentional: the handoff records actual completed design/planning work instead of presenting untested scaffolding as a working product.
