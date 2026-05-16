"""Task upload, processing, retrieval, and download routes."""

import base64

from bottle import HTTPResponse, request


def register_task_routes(app, deps):
    @app.post("/api/tasks/upload-text")
    @deps.require_auth
    def api_tasks_upload_text():
        context = deps.auth_context_from_request()
        payload = deps.read_json_payload()
        file_name = str(payload.get("file_name", "manuscript.txt") or "manuscript.txt")
        content = str(payload.get("content", "") or "")

        try:
            result = deps.upload_text_to_task(context, file_name=file_name, text=content, source_type="text")
            return deps.json_response(result, session_id=context.session_id)
        except Exception as exc:
            return deps.json_response(deps.error_payload("TASK_UPLOAD_FAILED", str(exc)), status=400, session_id=context.session_id)

    @app.post("/api/tasks/upload-docx")
    @deps.require_auth
    def api_tasks_upload_docx():
        context = deps.auth_context_from_request()
        payload = deps.read_json_payload()
        file_name = str(payload.get("file_name", "manuscript.docx") or "manuscript.docx")
        base64_data = str(payload.get("base64_data", "") or "")

        try:
            byte_data = base64.b64decode(base64_data)
        except Exception:
            return deps.json_response(deps.error_payload("TASK_UPLOAD_INVALID_BASE64", "Invalid base64 document payload"), status=400)

        try:
            result = deps.upload_docx_to_task(context, file_name=file_name, byte_data=byte_data)
            return deps.json_response(result, session_id=context.session_id)
        except Exception as exc:
            return deps.json_response(deps.error_payload("TASK_UPLOAD_FAILED", str(exc)), status=400, session_id=context.session_id)

    @app.get("/api/tasks")
    @deps.require_auth
    def api_tasks_list():
        context = deps.auth_context_from_request()
        try:
            limit = int(str(request.query.get("limit", "100") or "100"))
        except Exception:
            limit = 100
        tasks = deps.store.list_tasks_for_user(user_id=context.user_id, limit=limit)
        return deps.json_response(
            {
                "success": True,
                "tasks": [deps.task_summary(task) for task in tasks],
            },
            session_id=context.session_id,
        )

    @app.get("/api/tasks/<task_id>")
    @deps.require_auth
    def api_tasks_get(task_id: str):
        context = deps.auth_context_from_request()
        task, error = deps.get_owned_task_or_error(context, task_id)
        if error is not None:
            return error

        reports = task.get("reports") or {}

        clean_file = deps.store.get_task_file_for_user(
            task_id=task_id,
            file_type="clean",
            user_id=context.user_id,
            is_admin=context.role == deps.role_admin,
        )
        highlighted_file = deps.store.get_task_file_for_user(
            task_id=task_id,
            file_type="highlighted",
            user_id=context.user_id,
            is_admin=context.role == deps.role_admin,
        )

        payload = {
            "success": True,
            "task": {
                **deps.task_summary(task),
                "original_text": str(task.get("original_text") or ""),
                "corrected_text": str(task.get("corrected_text") or ""),
                "full_corrected_text": str(task.get("full_corrected_text") or ""),
                "options": task.get("options") or {},
                "reports": reports,
                "downloads": {
                    "clean": clean_file is not None,
                    "highlighted": highlighted_file is not None,
                },
            },
        }
        return deps.json_response(payload, session_id=context.session_id)

    @app.post("/api/tasks/<task_id>/process")
    @deps.require_auth
    def api_tasks_process(task_id: str):
        context = deps.auth_context_from_request()
        payload = deps.read_json_payload()
        options = payload.get("options", {})
        if not isinstance(options, dict):
            options = {}
        options = deps.apply_global_runtime_settings(options, deps.read_global_runtime_settings())

        task, error = deps.get_owned_task_or_error(context, task_id)
        if error is not None:
            return error

        if bool(payload.get("async", False) or payload.get("background", False)):
            deps.store.update_task_status(
                task_id=task_id,
                status="PROCESSING",
                user_id=context.user_id,
                is_admin=context.role == deps.role_admin,
            )

            def run_processing_job():
                try:
                    return deps.process_task(context, task, options)
                except Exception as exc:
                    deps.store.update_task_status(
                        task_id=task_id,
                        status="FAILED",
                        user_id=context.user_id,
                        is_admin=context.role == deps.role_admin,
                    )
                    deps.record_audit(
                        event_type="task_process_failed",
                        actor_user_id=context.user_id,
                        entity_type="task",
                        entity_id=task_id,
                        metadata={"error": str(exc), "async": True},
                    )
                    raise

            job = deps.processing_job_queue.submit(
                task_id=task_id,
                owner_user_id=str(task.get("user_id") or context.user_id),
                callback=run_processing_job,
            )
            deps.record_audit(
                event_type="task_process_queued",
                actor_user_id=context.user_id,
                entity_type="task",
                entity_id=task_id,
                metadata={"job_id": job.get("id", "")},
            )
            return deps.json_response(
                {
                    "success": True,
                    "queued": True,
                    "task_id": task_id,
                    "job": job,
                },
                status=202,
                session_id=context.session_id,
            )

        try:
            process_payload = deps.process_task(context, task, options)
            return deps.json_response(process_payload, session_id=context.session_id)
        except Exception as exc:
            deps.record_audit(
                event_type="task_process_failed",
                actor_user_id=context.user_id,
                entity_type="task",
                entity_id=task_id,
                metadata={"error": str(exc)},
            )
            return deps.json_response(deps.error_payload("TASK_PROCESS_FAILED", str(exc)), status=500, session_id=context.session_id)

    @app.get("/api/tasks/<task_id>/process-status")
    @deps.require_auth
    def api_tasks_process_status(task_id: str):
        context = deps.auth_context_from_request()
        task, error = deps.get_owned_task_or_error(context, task_id)
        if error is not None:
            return error

        job = deps.processing_job_queue.latest_for_task(
            task_id=task_id,
            owner_user_id=str(task.get("user_id") or context.user_id),
            is_admin=context.role == deps.role_admin,
        )
        return deps.json_response(
            {
                "success": True,
                "task_id": task_id,
                "status": str(task.get("status") or ""),
                "job": job,
                "task": deps.task_summary(task),
            },
            session_id=context.session_id,
        )

    @app.post("/api/tasks/<task_id>/apply-correction-group-decisions")
    @deps.require_auth
    def api_tasks_apply_group_decisions(task_id: str):
        context = deps.auth_context_from_request()
        payload = deps.read_json_payload()
        group_decisions = payload.get("group_decisions", {})
        if not isinstance(group_decisions, dict):
            group_decisions = {}

        task, error = deps.get_owned_task_or_error(context, task_id)
        if error is not None:
            return error

        try:
            process_payload = deps.apply_group_decisions(
                context,
                task,
                group_decisions,
                fallback_full_corrected=str(payload.get("full_corrected_text", "") or ""),
            )
            return deps.json_response(process_payload, session_id=context.session_id)
        except Exception as exc:
            return deps.json_response(deps.error_payload("TASK_DECISION_APPLY_FAILED", str(exc)), status=500, session_id=context.session_id)

    @app.get("/api/tasks/<task_id>/download")
    @deps.require_auth
    def api_tasks_download(task_id: str):
        context = deps.auth_context_from_request()
        file_type = str(request.query.get("type", "") or request.query.get("file_type", "") or "clean")

        try:
            deps.increment_runtime_counter(context.session_id, "export_attempts")
            payload = deps.read_task_download_payload(context, task_id=task_id, file_type=file_type)
            deps.increment_runtime_counter(context.session_id, "export_successes")
            return deps.json_response(payload, session_id=context.session_id)
        except Exception as exc:
            deps.increment_runtime_counter(context.session_id, "export_failures", "EXPORT_FILE_MISSING")
            return deps.json_response(
                deps.error_payload("EXPORT_FILE_MISSING", str(exc)),
                status=404,
                session_id=context.session_id,
            )

    @app.get("/api/tasks/<task_id>/download-file")
    @deps.require_auth
    def api_tasks_download_file(task_id: str):
        """Download generated DOCX as binary stream (avoids JSON/base64 transport)."""
        context = deps.auth_context_from_request()
        file_type = str(request.query.get("type", "") or request.query.get("file_type", "") or "clean")

        try:
            deps.increment_runtime_counter(context.session_id, "export_attempts")
            file_row, file_abs, normalized_type = deps.resolve_task_download_file(
                context=context,
                task_id=task_id,
                file_type=file_type,
            )

            download_name = str(file_row.get("download_name") or deps.build_download_filename("manuscript", normalized_type))
            mime_type = str(file_row.get("mime_type") or deps.mime_docx)

            with open(file_abs, "rb") as infile:
                body = infile.read()

            deps.record_audit(
                event_type="task_downloaded",
                actor_user_id=context.user_id,
                entity_type="task",
                entity_id=task_id,
                metadata={"file_type": normalized_type, "transport": "binary"},
            )
            deps.increment_runtime_counter(context.session_id, "export_successes")

            http_response = HTTPResponse(status=200, body=body)
            http_response.set_header("Content-Type", mime_type)
            http_response.set_header("Content-Disposition", f'attachment; filename="{download_name}"')
            http_response.set_header("Cache-Control", "no-store")
            return http_response
        except Exception as exc:
            deps.increment_runtime_counter(context.session_id, "export_failures", "EXPORT_FILE_MISSING")
            return deps.json_response(
                deps.error_payload("EXPORT_FILE_MISSING", str(exc)),
                status=404,
                session_id=context.session_id,
            )
