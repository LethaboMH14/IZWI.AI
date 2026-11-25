# IZWI AI studio

The entry screen is a live project lobby. A moving voice ring connects the five stages. A creator can scan each station, then enter the editor at the stage that needs work. On a phone the project and next action come first, followed by the same stage controls.

Desktop `[project and next action] [voice ring and stage controls]` → `[media and map] [prompt and proposals]`

Runway informs prompt placement, CapCut informs editing next to media, and Lusion informs the transition from overview to working space. The motion follows Emil Kowalski's focus on short transitions and keeps a reduced-motion path. [Runway](https://runway.com/) · [CapCut](https://www.capcut.com/) · [Lusion](https://lusion.co/)

| Slot | Existing stack |
| --- | --- |
| Shell, navigation, auth | Next.js, React, Better Auth and the IZWI workspace |
| Forms and panels | Native controls, IZWI studio styles and existing server actions |
| 3D and motion | Three.js room, CSS perspective for accessible editing cards |
| Icons and type | Phosphor, existing Fraunces display and Switzer text |
| Prompting | IZWI planner, shared proposal and approval state |
| Media | Project proxy, poster and outputs served by IZWI |

Scope moves C1–C5 and X10 where supported by the existing workflow. Existing projects open the Story Room by default. `#canvas` opens the editor directly and `#protect` opens the rights map. The public landing links to a labelled sample.

Run `npm run db:migrate` in `web/` before opening the studio. Existing listing prices default to by enquiry. Scene rewrites use the workspace's tested planning provider when configured. The creator reviews the proposal before applying it. Video generation, scene effects and payments require further integrations.
