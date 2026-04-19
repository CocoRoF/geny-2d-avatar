{{/* 공통 헬퍼 */}}

{{- define "geny-redis.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "geny-redis.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{ .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{ printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end -}}

{{- define "geny-redis.labels" -}}
app.kubernetes.io/name: {{ include "geny-redis.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- range $k, $v := .Values.commonLabels }}
{{ $k }}: {{ $v | quote }}
{{- end }}
{{- end -}}

{{- define "geny-redis.selectorLabels" -}}
app.kubernetes.io/name: {{ include "geny-redis.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* consumer 가 참조할 connection Secret 이름 */}}
{{- define "geny-redis.connectionSecretName" -}}
{{- if .Values.connectionSecret.name -}}
{{ .Values.connectionSecret.name }}
{{- else -}}
{{ include "geny-redis.fullname" . }}-connection
{{- end -}}
{{- end -}}

{{/* headless service 이름 (StatefulSet stable DNS) */}}
{{- define "geny-redis.headlessServiceName" -}}
{{ include "geny-redis.fullname" . }}-headless
{{- end -}}

{{/* primary service 이름 — consumer 가 write/queue 용으로 접속 */}}
{{- define "geny-redis.primaryServiceName" -}}
{{ include "geny-redis.fullname" . }}-primary
{{- end -}}

{{/* primary pod FQDN (StatefulSet 의 0번 pod) */}}
{{- define "geny-redis.primaryPodFqdn" -}}
{{ include "geny-redis.fullname" . }}-0.{{ include "geny-redis.headlessServiceName" . }}.{{ .Release.Namespace }}.svc.cluster.local
{{- end -}}

{{/* in-cluster 모드에서 렌더되는 REDIS_URL (인증 on 시 password 를 런타임 env 로 붙인다) */}}
{{- define "geny-redis.inClusterUrl" -}}
redis://{{ include "geny-redis.primaryServiceName" . }}:{{ .Values.inCluster.service.port }}/0
{{- end -}}
