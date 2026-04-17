(function () {
    if (typeof window === 'undefined') {
        return;
    }

    if (window.eel && typeof window.eel.expose === 'function') {
        return;
    }

    function responseToJson(response) {
        return response.text().then(function (text) {
            if (!text) {
                return { success: response.ok };
            }
            try {
                return JSON.parse(text);
            } catch (err) {
                return {
                    success: false,
                    error: 'Invalid JSON response from server',
                    raw: text
                };
            }
        });
    }

    var SESSION_STORAGE_KEY = 'manuscript_editor_web_session_id';

    function makeSessionId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return 'sess_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    function getSessionId() {
        try {
            var current = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (current) {
                return current;
            }
            current = makeSessionId();
            window.sessionStorage.setItem(SESSION_STORAGE_KEY, current);
            return current;
        } catch (err) {
            return makeSessionId();
        }
    }

    function requestJson(url, options) {
        var requestOptions = options || { credentials: 'same-origin' };
        requestOptions.credentials = requestOptions.credentials || 'same-origin';
        requestOptions.headers = requestOptions.headers || {};
        requestOptions.headers['X-Manuscript-Session'] = getSessionId();

        return fetch(url, requestOptions)
            .then(responseToJson)
            .catch(function (err) {
                return {
                    success: false,
                    error: String(err && err.message ? err.message : err)
                };
            });
    }

    function getJson(url) {
        return requestJson(url, {
            credentials: 'same-origin'
        });
    }

    function postJson(url, payload) {
        return requestJson(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload || {})
        });
    }

    function withCallback(promise, callback) {
        return Promise.resolve(promise)
            .then(function (payload) {
                if (typeof callback === 'function') {
                    callback(payload);
                }
                return payload;
            })
            .catch(function (err) {
                var payload = {
                    success: false,
                    error: String(err && err.message ? err.message : err)
                };
                if (typeof callback === 'function') {
                    callback(payload);
                }
                return payload;
            });
    }

    function callbackWrapper(handler) {
        return function () {
            var args = Array.prototype.slice.call(arguments);
            return function (callback) {
                return withCallback(handler.apply(null, args), callback);
            };
        };
    }

    window.eel = {
        expose: function () {},
        load_text_content: callbackWrapper(function (fileName, content) {
            return postJson('/api/load-text', {
                file_name: fileName,
                content: content
            });
        }),
        load_docx_content: callbackWrapper(function (fileName, base64Data) {
            return postJson('/api/load-docx', {
                file_name: fileName,
                base64_data: base64Data
            });
        }),
        process_document: callbackWrapper(function (options) {
            return postJson('/api/process-document', {
                options: options
            });
        }),
        apply_correction_group_decisions: callbackWrapper(function (groupDecisions) {
            return postJson('/api/apply-correction-group-decisions', {
                group_decisions: groupDecisions
            });
        }),
        get_redline_preview: callbackWrapper(function () {
            return getJson('/api/redline-preview');
        }),
        get_ollama_models: callbackWrapper(function (ollamaHost) {
            var query = '';
            if (ollamaHost) {
                query = '?ollama_host=' + encodeURIComponent(ollamaHost);
            }
            return getJson('/api/ollama-models' + query);
        }),
        export_file: callbackWrapper(function (fileType) {
            return postJson('/api/export-file', {
                file_type: fileType
            });
        }),
        save_file: callbackWrapper(function (fileType) {
            return postJson('/api/save-file', {
                file_type: fileType
            });
        }),
        get_runtime_telemetry: callbackWrapper(function () {
            return getJson('/api/runtime-telemetry');
        }),
        reset_runtime_telemetry: callbackWrapper(function () {
            return postJson('/api/runtime-telemetry/reset', {});
        }),
        reset_session: callbackWrapper(function () {
            return postJson('/api/reset-session', {});
        })
    };

    window.__MANUSCRIPT_WEB_MODE__ = true;
}());
