Build a production-grade Kubernetes Operator in Go using the Operator SDK / controller-runtime 
that manages Service Level Objectives (SLOs) via Prometheus Recording Rules, with User Journey 
aggregation and a React-based UI dashboard.

---

## CORE CRDS

### 1. SLORule (namespaced)
Defines a single SLO for a service.

Spec fields:
- serviceName: string
- description: string
- sloType: enum [availability, latency, throughput, error_rate, saturation]
- target: float (e.g. 99.9)
- window: string (e.g. "30d", "7d")
- labels: map[string]string (selectors for prometheus metrics)
- alerting:
    - enabled: bool
    - burnRateAlerts: list of { window: string, burnRate: float, severity: string }
    - annotations: map[string]string
- indicator:
    - type: enum [ratio, threshold, histogram_quantile]
    - goodQuery: string        # promql for good events
    - totalQuery: string       # promql for total events
    - thresholdQuery: string   # for threshold-based SLOs
    - latencyTarget: string    # for latency SLOs (e.g. "0.5" for 500ms)
    - percentile: float        # for histogram_quantile (e.g. 0.99)

Status fields:
- conditions: []metav1.Condition
- currentSLO: float
- errorBudgetRemaining: float
- errorBudgetConsumed: float
- lastEvaluatedAt: metav1.Time
- prometheusRuleRef: string
- phase: enum [Pending, Active, Violated, Degraded]

---

### 2. UserJourney (namespaced)
Aggregates multiple SLORules into a composite journey SLO.

Spec fields:
- description: string
- sloRefs: list of { name: string, namespace: string, weight: float }
- compositeMethod: enum [weighted_average, minimum, weakest_link]
- target: float
- window: string
- alerting:
    - enabled: bool
    - severity: string
    - annotations: map[string]string
- tags: map[string]string  # e.g. team, product, domain

Status fields:
- conditions: []metav1.Condition
- compositeSLO: float
- worstPerformingSLO: string
- allSLOsMet: bool
- errorBudgetRemaining: float
- lastEvaluatedAt: metav1.Time
- phase: enum [Healthy, AtRisk, Violated]

---

### 3. SLOPolicy (cluster-scoped)
Global defaults and org-level configuration.

Spec fields:
- defaultWindows: []string
- defaultBurnRateAlerts: list of burn rate thresholds
- prometheusEndpoint: string
- evaluationInterval: string
- notificationChannels:
    - slack: { webhookSecretRef, channel }
    - pagerduty: { routingKeySecretRef }
    - webhook: { url, secretRef }

---

## OPERATOR BEHAVIOR

### SLORule Controller:
1. Watch SLORule CRD changes
2. Generate PrometheusRule CR with:
   - Recording rules:
     - slo:sli_error:ratio_rate<window> — error ratio
     - slo:error_budget:remaining — remaining budget %
     - slo:error_budget:burn_rate<window> — burn rate
     - slo:objective:ratio — target ratio
   - Alerting rules per burn rate alert config using multi-window multi-burn-rate alerting
     (implement Google SRE Workbook approach: 1h+5m, 6h+30m, 3d+6h windows)
3. Patch SLORule status with current metrics by querying Prometheus HTTP API
4. Emit Kubernetes events on SLO violation / recovery
5. Reconcile every 60s or on spec change

### UserJourney Controller:
1. Watch UserJourney + referenced SLORules
2. Compute composite SLO based on compositeMethod:
   - weighted_average: Σ(slo_i * weight_i) / Σ(weight_i)
   - minimum: min(slo_i)
   - weakest_link: weight most violated SLO more heavily
3. Generate composite PrometheusRule with aggregated recording rules
4. Update status with composite SLO and worst performer
5. Trigger notifications via SLOPolicy channels on state changes

---

## EXTRA FEATURES TO IMPLEMENT

### Error Budget Policy Enforcement:
- Add ErrorBudgetPolicy CRD that can block CI/CD deployments (via webhook) when 
  error budget is below a threshold
- Implement a ValidatingWebhookConfiguration that checks budget before allowing 
  Deployment updates to labeled namespaces

### SLO Annotations / Events:
- SLOAnnotation CRD: record planned maintenance windows, incidents, deployments
  that affected SLOs — exclude these time ranges from SLO calculations via 
  Prometheus query offsets


---

## UI DASHBOARD (React + TypeScript)

Build a web dashboard served by a Go HTTP server embedded in the operator binary.

Pages:
1. **Overview**: 
   - SLO health heatmap grid (service × SLO type)
   - Global error budget burn rate spark lines
   - Violations feed (real-time via SSE or websocket)

2. **SLO Detail**:
   - SLI trend chart (last 7/30/90 days) using recharts
   - Error budget burn-down chart
   - Burn rate alert status (multi-window)
   - Annotations overlaid on charts (incidents, deployments)

3. **User Journey View**:
   - Journey dependency graph (D3 force-directed) showing SLO nodes
   - Composite SLO gauge with individual SLO breakdown
   - "Weakest link" highlighting

4. **SLO Editor** (form-based CRUD):
   - Prometheus query builder with live preview
   - Target/window sliders
   - Alert configuration panel

5. **Error Budget Policy**:
   - Toggle deployment gates per namespace
   - Budget threshold sliders

UI Backend:
- REST API at /api/v1/ exposing:
  - GET /slorules, /userjourneys, /sloannotations
  - POST/PUT/DELETE for CRUD
  - GET /metrics/slo/{name} — proxied prometheus query results
  - GET /stream/violations — SSE stream for real-time alerts

---

## TECH STACK

- Go 1.22+
- controller-runtime v0.18+
- kubebuilder v3 markers for CRD generation
- Prometheus client_golang for metric scraping
- React 18 + TypeScript + Vite
- Recharts for time series, D3 for journey graph
- TailwindCSS + shadcn/ui components
- Helm chart for deployment (with values for prometheus endpoint, UI toggle, replicas)
- Dockerfile: multi-stage, scratch-based final image with embedded UI static files
- GitHub Actions CI: lint, test, docker build, helm lint

---

## PROJECT STRUCTURE

slo-operator/
├── api/v1alpha1/
│   ├── slorule_types.go
│   ├── userjourney_types.go
│   ├── slopolicy_types.go
│   ├── errorbudgetpolicy_types.go
│   └── sloannotation_types.go
├── internal/controller/
│   ├── slorule_controller.go
│   ├── userjourney_controller.go
│   └── slopolicy_controller.go
├── internal/prometheus/
│   ├── rule_builder.go       # builds PrometheusRule manifests
│   ├── query_client.go       # Prometheus HTTP API client
│   └── sli_calculator.go     # SLI/error budget math
├── internal/webhook/
│   ├── errorbudget_webhook.go
│   └── slorule_defaulter.go
├── internal/api/
│   ├── server.go
│   ├── handlers.go
│   └── sse.go
├── ui/                        # React app
├── config/                    # kustomize manifests
├── helm/slo-operator/
├── Dockerfile
└── main.go

---

## DELIVERABLES

1. Fully functional operator with all 5 CRDs
2. PrometheusRule generation with multi-window burn rate alerting
3. UserJourney composite SLO calculation (all 3 methods)
4. Error budget deployment gate webhook
5. Embedded React UI dashboard
6. Helm chart with sane defaults
7. README with: architecture diagram, quickstart, CRD field reference, Prometheus 
   setup prerequisites, example manifests for common SLO types 
   (HTTP availability, gRPC latency, queue throughput)
8. Unit tests for SLI math, recording rule generation
9. e2e tests using envtest + prometheus mock