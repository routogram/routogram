use super::FrameworkSignals;

pub fn detect(source: &str) -> FrameworkSignals {
    let mut signals = FrameworkSignals::default();

    for effect in ["useEffect", "useLayoutEffect", "useInsertionEffect"] {
        if source.contains(&format!("{effect}(")) {
            signals.side_effects.push(effect.to_string());
        }
    }
    for state in ["useState", "useReducer", "useSyncExternalStore"] {
        if source.contains(&format!("{state}(")) {
            signals.state_management.push(state.to_string());
        }
    }
    if source.contains("zustand") || source.contains("create<") || source.contains("create(") {
        signals.state_management.push("Zustand".to_string());
    }
    if source.contains("nanostores") || source.contains("atom(") {
        signals.state_management.push("Nano Stores".to_string());
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
    fn detects_react_effects_and_state() {
        let signals = detect("useEffect(() => {}, []); useState(0);");
        assert_eq!(signals.side_effects, vec!["useEffect"]);
        assert_eq!(signals.state_management, vec!["useState"]);
    }
}
