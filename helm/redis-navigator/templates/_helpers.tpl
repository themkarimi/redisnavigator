{{/*
Expand the name of the chart.
*/}}
{{- define "redis-navigator.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "redis-navigator.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label value.
*/}}
{{- define "redis-navigator.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels shared by all resources.
*/}}
{{- define "redis-navigator.labels" -}}
helm.sh/chart: {{ include "redis-navigator.chart" . }}
{{ include "redis-navigator.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "redis-navigator.selectorLabels" -}}
app.kubernetes.io/name: {{ include "redis-navigator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Backend-specific selector labels.
*/}}
{{- define "redis-navigator.backend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "redis-navigator.name" . }}-backend
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Frontend-specific selector labels.
*/}}
{{- define "redis-navigator.frontend.selectorLabels" -}}
app.kubernetes.io/name: {{ include "redis-navigator.name" . }}-frontend
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "redis-navigator.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "redis-navigator.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Backend image (repository:tag).
*/}}
{{- define "redis-navigator.backend.image" -}}
{{- $tag := .Values.backend.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.backend.image.repository $tag }}
{{- end }}

{{/*
Frontend image (repository:tag).
*/}}
{{- define "redis-navigator.frontend.image" -}}
{{- $tag := .Values.frontend.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.frontend.image.repository $tag }}
{{- end }}

{{/*
Name of the Secret that holds backend sensitive env vars.
*/}}
{{- define "redis-navigator.backend.secretName" -}}
{{- if .Values.backend.existingSecret }}
{{- .Values.backend.existingSecret }}
{{- else }}
{{- printf "%s-backend" (include "redis-navigator.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Name of the Secret that holds the database URL.
*/}}
{{- define "redis-navigator.database.secretName" -}}
{{- if .Values.externalDatabase.existingSecret }}
{{- .Values.externalDatabase.existingSecret }}
{{- else }}
{{- printf "%s-database" (include "redis-navigator.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Key within the database secret that contains the DSN.
*/}}
{{- define "redis-navigator.database.secretKey" -}}
{{- default "DATABASE_URL" .Values.externalDatabase.existingSecretKey }}
{{- end }}

{{/*
Name of the Secret that holds the OIDC client secret.
*/}}
{{- define "redis-navigator.oidc.secretName" -}}
{{- if .Values.oidc.existingSecret }}
{{- .Values.oidc.existingSecret }}
{{- else }}
{{- include "redis-navigator.backend.secretName" . }}
{{- end }}
{{- end }}

{{/*
Key within the OIDC secret that contains the client secret.
*/}}
{{- define "redis-navigator.oidc.secretKey" -}}
{{- default "OIDC_CLIENT_SECRET" .Values.oidc.existingSecretKey }}
{{- end }}
