pub fn init() {
    let filter = std::env::var("RUST_LOG").unwrap_or_else(|_| "pokeidle_manager_lib=info".into());
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_target(false)
        .try_init();
}
pub fn sanitize_frame(raw: &str) -> String {
    let mut value: serde_json::Value = match serde_json::from_str(raw) {
        Ok(value) => value,
        Err(_) => return "[non-json frame]".into(),
    };
    // A login hello is always secret-bearing, including fields unknown to us.
    // A strict projection protects against future protocol field additions.
    if value.get("t").and_then(serde_json::Value::as_str) == Some("hello") {
        return r#"{"t":"hello","credenciais":"[REDACTED]"}"#.into();
    }
    redact(&mut value);
    value.to_string()
}

fn secret_field(key: &str) -> bool {
    let key = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    key.contains("token")
        || key.contains("secret")
        || key.contains("password")
        || key.contains("cookie")
        || key.contains("apikey")
        || key.contains("credential")
        || key == "authorization"
        || key == "auth"
        || key == "jwt"
        || key == "dispositivo"
        || key == "deviceid"
}

fn redact(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, value) in map.iter_mut() {
                if secret_field(key) {
                    *value = serde_json::Value::String("[REDACTED]".into());
                } else {
                    redact(value);
                }
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                redact(value);
            }
        }
        _ => {}
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn redacts_camel_case_nested_and_unknown_hello_keys() {
        let raw = r#"{"t":"state","nested":{"sessionToken":"SESSION123","apiKey":"KEY123","refresh-token":"R123","stats":42}}"#;
        let safe = sanitize_frame(raw);
        for secret in ["SESSION123", "KEY123", "R123"] {
            assert!(!safe.contains(secret));
        }
        assert!(safe.contains("42"));
        let future_hello = r#"{"t":"hello","pass": "FUTURE_PASS", "newFieldSecret": "FUTURE_SECRET"}"#;
        let safe = sanitize_frame(future_hello);
        assert!(!safe.contains("FUTURE_PASS"));
        assert!(!safe.contains("FUTURE_SECRET"));
        assert!(safe.contains("REDACTED"));
    }

    #[test]
    fn redacts_secrets() {
        assert!(
            !sanitize_frame(r#"{"token":"secret","nested":{"authorization":"bearer"}}"#)
                .contains("secret")
        );
    }
}
