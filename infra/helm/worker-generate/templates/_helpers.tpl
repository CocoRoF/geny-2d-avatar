{{/* 공통 헬퍼 */}}

{{- define "geny-worker-generate.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "geny-worker-generate.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{ .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{ printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end -}}
{{- end -}}

{{- define "geny-worker-generate.labels" -}}
app.kubernetes.io/name: {{ include "geny-worker-generate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- range $k, $v := .Values.commonLabels }}
{{ $k }}: {{ $v | quote }}
{{- end }}
{{- end -}}

{{- define "geny-worker-generate.selectorLabels" -}}
app.kubernetes.io/name: {{ include "geny-worker-generate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "geny-worker-generate.producerFullname" -}}
{{ include "geny-worker-generate.fullname" . }}-producer
{{- end -}}

{{- define "geny-worker-generate.consumerFullname" -}}
{{ include "geny-worker-generate.fullname" . }}-consumer
{{- end -}}

{{/*
  공통 CLI args — producer/consumer 모두에 전달.
  driver/queueName/http/catalog + 공통 extraArgs.
*/}}
{{- define "geny-worker-generate.commonArgs" -}}
- --driver
- {{ .Values.worker.driver | quote }}
- --queue-name
- {{ .Values.worker.queueName | quote }}
{{- if .Values.worker.httpAdapters.enabled }}
- --http
{{- end }}
{{- if .Values.worker.catalog.configMapName }}
- --catalog
- {{ .Values.worker.catalog.mountPath | quote }}
{{- end }}
{{- range .Values.worker.extraArgs }}
- {{ . | quote }}
{{- end }}
{{- end -}}

{{/*
  공통 env — REDIS_URL secretKeyRef (+ 선택적 HTTP adapter keys envFrom).
  bullmq driver 에서만 REDIS_URL 이 필요하지만 in-memory 에서도 무해 (사용 안 함).
*/}}
{{- define "geny-worker-generate.commonEnv" -}}
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.redis.existingSecret | quote }}
      key: {{ .Values.redis.existingSecretKey | quote }}
{{- end -}}

{{- define "geny-worker-generate.envFrom" -}}
{{- if and .Values.worker.httpAdapters.enabled .Values.worker.httpAdapters.existingSecret -}}
- secretRef:
    name: {{ .Values.worker.httpAdapters.existingSecret | quote }}
{{- end -}}
{{- end -}}

{{/* catalog volume/mount (옵션) */}}
{{- define "geny-worker-generate.catalogVolume" -}}
{{- if .Values.worker.catalog.configMapName -}}
- name: catalog
  configMap:
    name: {{ .Values.worker.catalog.configMapName | quote }}
    items:
      - key: {{ .Values.worker.catalog.configKey | quote }}
        path: {{ base .Values.worker.catalog.mountPath | quote }}
{{- end -}}
{{- end -}}

{{- define "geny-worker-generate.catalogVolumeMount" -}}
{{- if .Values.worker.catalog.configMapName -}}
- name: catalog
  mountPath: {{ dir .Values.worker.catalog.mountPath | quote }}
  readOnly: true
{{- end -}}
{{- end -}}
