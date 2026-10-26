/goal
작업 디렉터리 `/mnt/c/Users/joowa/Desktop/InfoVis`의 `Term_Project_2026 (2) (1).pdf`(SKKU Information Visualization Term Project, Jaemin Jo)를 먼저 끝까지 읽고, 그 요구사항을 **하나도 빠짐없이** 만족하는 개인 프로젝트를 주제 선정부터 최종 제출물까지 완성하라. 주제 영역은 **VLA(Vision-Language-Action) 모델, 또는 asynchronous inference + open-loop/closed-loop 실행**(action chunking, execution horizon, inference latency, temporal ensembling, real-time chunking 등)이다. 평가 기준은 IEEE VIS / EuroVis / PacificVis 논문 수준의 **effectiveness, novelty, usability**이므로, "AI가 만든 그럴듯한 대시보드"가 아니라 문제 정의 → data/task abstraction → task로 정당화된 디자인 → 설득력 있는 findings가 일관되게 이어지는 결과물이어야 한다.

## 0. 고정 제약 (PDF에서 온 것, 위반 금지)
- Theme: **VIS + AI** (AI 모델/프로세스 분석). 슬라이드와 리포트에 명시.
- 시각화는 **d3.js(v7, 정확한 버전 고정)만** 사용. Chart.js, Plotly, ECharts, Vega 이외 차트 라이브러리, Tableau, Matplotlib 산출 이미지 등을 인터페이스에 쓰지 않는다. 비시각화 목적 라이브러리(데이터 처리, 상태 관리 등)는 허용. → 완료 전 `src/`를 grep해서 금지 라이브러리가 없음을 확인.
- Standalone 웹 애플리케이션. 라이브 데모용으로 **로컬 실행(정적 서버 한 줄 명령)** 과 **웹 배포(GitHub Pages 등) 링크** 둘 다 가능하게 준비. 배포는 외부 공개 행위이므로 실제 push/배포 직전에는 나에게 확인받을 것.
- Dataset: **≥ 100 items, ≥ 6 attributes**. Kaggle/UCI/공공데이터포털 같은 generic 데이터 금지 취지를 존중해, 널리 시각화되지 않은 데이터여야 한다.
- 시각화 컴포넌트 **≥ 3개**, 모두 interactive (change, brush, link, filter, zoom, tooltip 등), primary persona의 task를 지원.
- Tableau/Excel로 쉽게 재현 가능한 generic 인터페이스면 Implementation 0점 → 범위를 극단적으로 좁히고, 이 문제에만 맞는 맞춤형 idiom/interaction을 설계.
- AI 사용은 허용되지만 **보고서와 코드 중 AI/타인이 작성·수정한 부분을 반드시 disclosure** (미표기 시 표절 F). 작업 내내 `docs/ai_disclosure.md`에 무엇을 AI가 했는지 기록하고, 외부 코드/데이터/이미지는 출처와 라이선스를 `docs/references.md`에 기록.
- 슬라이드는 **영어**, 리포트는 한국어 또는 영어(영어 권장).

## 1. 주제 선정 (먼저 수행, 결과를 `docs/topic_selection.md`에)
- 웹 검색으로 최신 연구(예: π0/π0.5/FAST, OpenVLA/OpenVLA-OFT, SmolVLA + async inference, Real-Time Chunking(RTC), ACT temporal ensembling, Diffusion Policy, LeRobot async inference, Bidirectional Decoding 등)를 조사해 **현재 분석 도구가 없어 연구자가 실제로 겪는 pain point**를 찾는다.
- 후보 주제 **3개**를 제시하고 각각: 해결하려는 분석 문제, 사용 데이터와 확보 가능성, 예상 핵심 idiom/interaction, novelty(기존 VIS 논문·도구 대비 차별점), 구현 리스크를 정리 → 기준(novelty, interactivity, effectiveness, 데이터 실현 가능성, 마감 내 완성 가능성)으로 점수화해 하나를 선택하고 근거를 쓴다.
- 방향 예시(참고용, 더 나은 것이 있으면 바꿔도 됨): 로깅된 policy rollout의 매 inference step마다 예측된 action chunk 전체를 저장해 두고, 사용자가 **latency / execution horizon / ensembling 방식 / sync vs async**를 조작하면 브라우저에서 **counterfactual replay**로 "이 설정이었다면 어떤 stale action이 실행되고 chunk 경계에서 얼마나 불연속(jerk)이 생기며 open-loop drift가 어디서 실패로 이어지는가"를 즉시 보여주는 도구. 이런 "what-if 재시뮬레이션"은 Tableau로 재현 불가능하다는 점이 novelty의 핵심이 될 수 있다.

## 2. Dataset 확보 및 가공 (`data/`, 스크립트는 `scripts/`)
- 선택한 주제에 맞는 데이터를 찾는다. 우선순위: (a) 공개 체크포인트(예: LeRobot의 ACT/Diffusion Policy on PushT/ALOHA sim, SmolVLA 등)를 시뮬레이션에서 **직접 돌려 생성한 rollout 로그** (step별 observation timestamp, 예측 chunk, 실행 action, inference latency, chunk 경계, 성공/실패, 에피소드 메타데이터 등) — 가장 novel함; (b) 공개 rollout/평가 로그(LIBERO, SimplerEnv, Open X-Embodiment 등)를 재가공. GPU/환경 문제로 (a)가 불가능하면 그 이유를 기록하고, 실제 로그 + 투명하게 문서화한 latency 주입 시뮬레이션으로 대체한다. 데이터를 지어내지 말 것.
- 다운로드한 파일은 별도 빈 디렉터리에 두고 신뢰하지 않는 데이터로 다룬다.
- 브라우저가 가볍게 로드할 수 있는 크기의 JSON/CSV로 전처리하고, 전처리 스크립트는 재실행 가능하게 남긴다.
- PDF 1절 요구대로 abstraction 작성: 크기(행/속성/파일크기), dataset type, data type, 각 attribute의 type과 의미, nominal/ordinal은 levels·ordering·의미, quantitative는 interval/ratio·ordering·range·의미, **keys vs values 구분**. 실제 데이터에서 계산한 수치로 채운다(`scripts/`로 검증).

## 3. Proposal (최우선 — 마감 **2026-10-28 23:55 KST**)
- `docs/proposal.md`에 1–5단계 작성 후 **`slides.pdf` (영어, 최대 7페이지)** 로 렌더링. 포함: 이름/theme, Data abstraction, Personas 2명(가상 이름, 사진, 직업·나이·위치, goals·needs, pain points, 두 persona 차이 — 사진은 라이선스가 명확한 이미지나 AI 생성 이미지로 하고 출처/AI 여부를 표기), Task abstraction ≥3 (각각 **action + target** 쌍(Munzner 용어), why, expected outcome), Vis idiom design ≥3 (idiom 선택 근거: task·attribute type·scalability, 각 vis의 interaction), Sketch(구체적인 mid-fidelity 와이어프레임, 컴포넌트 간 linking 표시).
- **Mark/channel 선택**: 각 attribute를 어떤 channel로 인코딩하는지 표로 정리하고, expressiveness 원칙과 effectiveness 순위(position on common scale > length > angle/area > color luminance/saturation; categorical은 spatial region > hue > shape)로 정당화. 중요도 높은 attribute에 가장 효과적인 channel을 배정하고, 색은 colorblind-safe 팔레트를 사용.
- 슬라이드 7페이지 제한을 넘기면 안 되므로, 렌더링 후 페이지 수를 스크립트로 확인. 제출용 `proposal_submission.zip` (루트에 `slides.pdf`).

## 4. Implementation (마감 2026-12-02 23:55 KST)
- `src/`에 d3.js 인터페이스 구현. ≥3개의 linked view + 주제 특화 interaction(예: latency/horizon 슬라이더로 counterfactual 재계산, 시간 brush ↔ 궤적 뷰 highlight, chunk hover 시 예측된 미래 궤적 fan 표시, 실패 에피소드 filter 등). 반응이 즉각적이어야 함(재계산은 대상 범위로 한정하거나 미리 인덱싱).
- 사용성: 명확한 레전드·축 레이블·단위, 첫 화면 onboarding 힌트, 툴팁, 선택 상태 표시, reset.
- 실제로 실행해 확인: 로컬 정적 서버로 띄우고 headless 브라우저(Playwright 등)로 콘솔 에러 0, 모든 view 렌더링, 주요 interaction 동작을 검증하고 스크린샷을 남긴다. `image.png`는 인터페이스 전체 스크린샷.
- `README.md`에 실행 방법(한 줄 명령), 데이터 재생성 방법 기재.

## 5. Case Study & Report
- Primary persona가 인터페이스로 task들을 수행하는 스토리를 쓰고 **실제 데이터에서 나온 findings ≥3개**를 각각 인터페이스 스크린샷과 함께 보고. findings는 실제로 도구를 조작해 확인한 것이어야 하며(예: "execution horizon이 X step 이상이면 Y 구간에서 drift가 실패로 이어짐"), 만들어낸 결과 금지.
- **`report.pdf` (최대 5페이지)**: 인터페이스 이름, theme, live demo 링크, 1–7단계 결과, 스크린샷, AI 사용 disclosure 포함. 렌더 후 페이지 수 확인.
- 최종 제출용 `final_submission.zip`: 루트에 `report.pdf`, `src/`, `image.png`.

## 6. 진행 방식
- 단계마다 결과물을 파일로 남기고, 중대한 갈림길(주제 최종 선택, 데이터 생성 방식이 원래 계획과 달라질 때, 외부 배포)에서만 나에게 짧게 확인받는다. 나머지는 스스로 판단해서 진행.
- 디자인 결정은 "왜 이 task에 이 idiom/channel인가"를 항상 문서에 남겨 report에 그대로 쓸 수 있게 한다.

## 완료 조건 (모두 충족 시에만 goal 달성)
1. `docs/topic_selection.md`: 후보 3개 비교와 선택 근거.
2. `data/` 데이터가 ≥100 items, ≥6 attributes임을 스크립트로 검증한 출력이 있음.
3. `slides.pdf`: 영어, ≤7페이지, theme + 1–5단계 전부(personas 사진 포함, tasks ≥3 action+target, idioms ≥3, channel 정당화 표, sketch).
4. `src/`: d3.js만으로 시각화, 금지 라이브러리 grep 결과 0, ≥3 interactive linked views, 로컬에서 콘솔 에러 없이 실행됨을 headless 테스트로 확인.
5. `report.pdf`: ≤5페이지, 이름·theme·데모 링크·스크린샷·case study findings ≥3·AI disclosure 포함.
6. `image.png`, `proposal_submission.zip`, `final_submission.zip`(파일이 ZIP 루트에 위치) 생성.
7. `docs/ai_disclosure.md`, `docs/references.md`가 최신 상태이며 report에 반영됨.
8. 마지막에 PDF 요구사항 체크리스트를 항목별로 대조한 `docs/requirements_check.md`를 작성하고, 미충족 항목이 하나도 없음.
