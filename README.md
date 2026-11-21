# IZWI AI
**Create · Localise · Protect · Publish · Earn**

A proposed creative operating system for South African independent creators and small studios. Team Sonar's concept connects media creation, language review, creator records, distribution and earning opportunities in one workspace.

**Status: planning and design handoff, not a working application.** No authentication service, billing integration, AI pipeline or production deployment has been implemented in this repository. Mockups illustrate intended behaviour; prices, budgets and pilot metrics are proposals.

## Start here
1. [Handoff and current decisions](docs/HANDOFF.md)
2. [Product requirements and user journey](docs/PRODUCT.md)
3. [Lean canvas](docs/business/LEAN-CANVAS.md) and [financial model](docs/business/FINANCIALS.md)
4. [Architecture](docs/engineering/ARCHITECTURE.md), [open-source tool choices](docs/engineering/OPEN-SOURCE-TOOLS.md), [implementation backlog](docs/engineering/BACKLOG.md)
5. [Design rules](docs/design/DESIGN-SYSTEM.md) and [poster brief](docs/design/POSTER-BRIEF.md)
6. [All deliverables and version history](assets/README.md)
7. [Platform plan](docs/PLATFORM-PLAN.md): the full brief built from open-source parts (proposal)
8. [Frontend design prototype](docs/design/FRONTEND.md) in `web/` (sample data, nothing wired), with mockups in `design/mockups/`

## Current deliverables
- [Latest full-solution poster PNG](assets/current/poster/izwi-ai-full-solution.png)
- [Canvas-aligned 12-slide presentation PDF](assets/current/presentation/izwi-ai-canvas-aligned-v2.pdf)
- [PowerPoint](assets/current/presentation/izwi-ai-canvas-aligned-v2.pptx)
- [Slide contact sheet](assets/current/presentation/contact-sheet.png)
- [Original Team Sonar profile and lean canvas](assets/source/sonar-team-profile.pdf)
- [Editable Figma presentation](https://www.figma.com/slides/4SiLtJaa01WcjaD44LcLp9)
- [Earlier editable UI concept boards](https://www.figma.com/design/IVJa5NlJJINI75Lyc9Eklw) — superseded styling; see archive notes.

The PowerPoint contains slide images with fade transitions and presenter notes. Editable design layers are in Figma. The poster is generated raster artwork, not editable UI code. Figma native object animation was unavailable; PowerPoint playback was not visually tested.

## Pull and inspect
```sh
git clone https://github.com/LethaboMH14/IZWI.AI.git
cd IZWI.AI
python3 scripts/verify_handoff.py
python3 scripts/financial_model.py
```
These scripts use Python's standard library. For an existing checkout, run `git pull --ff-only` first. See [development setup](docs/engineering/DEVELOPMENT.md) for the implementation sequence. `web/` holds a design prototype only (`cd web && npm install && npm run dev`); there is no working application yet.

## Scope
First vertical slice: upload → suggest/edit clips → review multilingual captions → export → prepare distribution.
The full five-stage vision stays visible, while advanced dubbing, social integrations, marketplace transactions and hybrid local execution are introduced progressively.

## Licensing
The existing [MIT licence](LICENSE) is retained. Third-party software, model weights, fonts, Figma/community assets and generated artwork have separate provenance considerations; see [asset rights](assets/RIGHTS.md). No third-party source code or model weights are vendored here.
