use super::FrameworkSignals;

pub fn detect(source: &str) -> FrameworkSignals {
    let mut signals = FrameworkSignals::default();

    for effect in [
        "watch",
        "watchEffect",
        "onMounted",
        "onUnmounted",
        "onBeforeUnmount",
    ] {
        if source.contains(&format!("{effect}(")) {
            signals.side_effects.push(effect.to_string());
        }
    }
    for state in ["ref", "reactive", "computed", "defineStore"] {
        if source.contains(&format!("{state}("))
            || (state == "defineStore" && source.contains("defineStore"))
        {
            signals.state_management.push(if state == "defineStore" {
                "Pinia".to_string()
            } else {
                state.to_string()
            });
        }
    }
    if source.contains("pinia") || source.contains("defineStore") {
        signals.state_management.push("Pinia".to_string());
    }

    signals.side_effects.sort();
    signals.side_effects.dedup();
    signals.state_management.sort();
    signals.state_management.dedup();
    signals
}

#[cfg(test)]
mod tests {
    use super::detect;

    #[test]
    fn detects_vue_lifecycle_and_state() {
        let signals = detect("const count = ref(0); watch(count, () => {}); onMounted(() => {});");
        assert!(signals.state_management.contains(&"ref".to_string()));
        assert!(signals.side_effects.contains(&"watch".to_string()));
        assert!(signals.side_effects.contains(&"onMounted".to_string()));
    }
}
