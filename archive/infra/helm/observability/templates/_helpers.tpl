{{/* 공통 헬퍼 */}}

{{- define "geny-observability.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "geny-observability.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{ .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{ printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end -}}

{{- define "geny-observability.labels" -}}
app.kubernetes.io/name: {{ include "geny-observability.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- range $k, $v := .Values.commonLabels }}
{{ $k }}: {{ $v | quote }}
{{- end }}
{{- end -}}

{{- define "geny-observability.selectorLabels" -}}
app.kubernetes.io/name: {{ include "geny-observability.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "geny-observability.prometheusFullname" -}}
{{ include "geny-observability.fullname" . }}-prometheus
{{- end -}}

{{- define "geny-observability.alertmanagerFullname" -}}
{{ include "geny-observability.fullname" . }}-alertmanager
{{- end -}}

{{- define "geny-observability.grafanaFullname" -}}
{{ include "geny-observability.fullname" . }}-grafana
{{- end -}}
