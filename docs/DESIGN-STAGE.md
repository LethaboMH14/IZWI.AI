# Design stage

Status: partial. Behind `IZWI_FLAG_DESIGN=0`, each project has a Design stage where creators make a text-led SVG mock-up for thumbnails, covers, posters, countdown posters or illustration cards. Headline, subtitle, platform and accent are editable; a design is saved as a draft, explicitly approved by the creator, then downloadable. It is clearly not an AI-generated image and is not attached to a post.

The one selected open-weight image model candidate is FLUX.1 [schnell], whose official model card lists Apache-2.0: https://github.com/black-forest-labs/flux/blob/main/model_cards/FLUX.1-schnell.md (checked 2026-11-28). FLUX.1 [dev] is non-commercial and is not selected. A local ComfyUI runtime, image-provider role, image output storage/provenance record, generated-image approval and attachment workflow still need to be built. No real-person likeness or uploaded photo input is accepted by the current mock-up tool.

Checks: `web/tests/design-drafts.test.ts`, `web/tests/migration-history.test.ts`, `web/e2e/design-stage.spec.ts`; authenticated browser screenshots require a local owner state and project ID fixture.