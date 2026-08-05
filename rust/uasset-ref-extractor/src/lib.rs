use std::collections::HashMap;

use serde::{Deserialize, Serialize};

const ZERO_GUID: &str = "00000000000000000000000000000000";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractInput {
    pub from_guid: String,
    pub content: String,
}

#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOutput {
    pub edges: Vec<Edge>,
    pub unresolved: Vec<UnresolvedRef>,
    pub binary_serialized: bool,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub from_guid: String,
    pub to_guid: String,
    pub ref_kind: String,
    pub file_id: Option<String>,
    pub context: Option<String>,
    pub count: u32,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct UnresolvedRef {
    pub from_guid: String,
    pub to_guid: String,
    pub context: Option<String>,
}

pub fn extract(input: &ExtractInput, targets: &HashMap<String, String>) -> ExtractOutput {
    if !input.content.trim_start().starts_with("%YAML") {
        return ExtractOutput {
            binary_serialized: true,
            ..ExtractOutput::default()
        };
    }

    let mut edges: Vec<Edge> = Vec::new();
    let mut edge_indices = HashMap::<String, usize>::new();
    let mut unresolved = Vec::new();
    let mut last_key: Option<String> = None;

    for line in input.content.split('\n') {
        if let Some(key) = key_at_line_start(line) {
            last_key = Some(key);
        }
        let context = last_key.clone();
        let mut cursor = 0;
        while let Some(open_offset) = line[cursor..].find('{') {
            let open = cursor + open_offset;
            let Some(close_offset) = line[open + 1..].find('}') else {
                break;
            };
            let close = open + 1 + close_offset;
            let group = &line[open + 1..close];
            cursor = close + 1;

            let Some(guid) = field_value(group, "guid:", 32) else {
                continue;
            };
            let guid = guid.to_ascii_lowercase();
            if guid == ZERO_GUID || guid == input.from_guid {
                continue;
            }

            let file_id = signed_field_value(group, "fileID:");
            let Some(asset_type) = targets.get(&guid) else {
                unresolved.push(UnresolvedRef {
                    from_guid: input.from_guid.clone(),
                    to_guid: guid,
                    context: context.clone(),
                });
                continue;
            };

            let ref_kind = kind_for(asset_type);
            let key = format!(
                "{}\0{}\0{}",
                guid,
                ref_kind,
                context.as_deref().unwrap_or("")
            );
            if let Some(index) = edge_indices.get(&key) {
                edges[*index].count += 1;
            } else {
                edge_indices.insert(key, edges.len());
                edges.push(Edge {
                    from_guid: input.from_guid.clone(),
                    to_guid: guid,
                    ref_kind,
                    file_id,
                    context: context.clone(),
                    count: 1,
                });
            }
        }
    }

    ExtractOutput {
        edges,
        unresolved,
        binary_serialized: false,
    }
}

fn key_at_line_start(line: &str) -> Option<String> {
    let trimmed = line.trim_start_matches(char::is_whitespace);
    let mut chars = trimmed.char_indices();
    let (_, first) = chars.next()?;
    if !(first == '_' || first.is_ascii_alphabetic()) {
        return None;
    }

    let end = chars
        .find_map(|(index, ch)| (!(ch == '_' || ch.is_ascii_alphanumeric())).then_some(index))
        .unwrap_or(trimmed.len());
    let rest = &trimmed[end..];
    if rest.trim_start().starts_with(':') {
        Some(trimmed[..end].to_string())
    } else {
        None
    }
}

fn field_value(group: &str, field: &str, max_len: usize) -> Option<String> {
    let start = group.find(field)? + field.len();
    let value = group[start..].trim_start();
    let token: String = value
        .chars()
        .take_while(|ch| ch.is_ascii_hexdigit())
        .take(max_len)
        .collect();
    (token.len() == max_len).then_some(token)
}

fn signed_field_value(group: &str, field: &str) -> Option<String> {
    let start = group.find(field)? + field.len();
    let value = group[start..].trim_start();
    let mut end = 0;
    for (index, ch) in value.char_indices() {
        if index == 0 && ch == '-' {
            end = ch.len_utf8();
            continue;
        }
        if !ch.is_ascii_digit() {
            break;
        }
        end = index + ch.len_utf8();
    }
    (end > 0).then_some(value[..end].to_string())
}

fn kind_for(asset_type: &str) -> String {
    match asset_type {
        "Script" => "USES_SCRIPT",
        "Material" => "USES_MATERIAL",
        "Texture" | "Sprite" => "USES_TEXTURE",
        "Shader" => "USES_SHADER",
        "Model" => "USES_MESH",
        "AnimationClip" | "AnimatorController" => "USES_ANIMATION",
        "Prefab" => "NESTED_PREFAB",
        _ => "SERIALIZED_REF",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::{extract, Edge, ExtractInput, ExtractOutput};

    fn input(content: &str) -> ExtractInput {
        ExtractInput {
            from_guid: "a".repeat(32),
            content: content.to_string(),
        }
    }

    #[test]
    fn extracts_and_aggregates_edges() {
        let target = "b".repeat(32);
        let mut targets = std::collections::HashMap::new();
        targets.insert(target.clone(), "Texture".to_string());
        let result = extract(
            &input(&format!(
                "%YAML 1.1\nPrefab:\n  one: {{fileID: 1, guid: {target}, type: 3}}\n  one: {{fileID: 2, guid: {target}, type: 3}}\n"
            )),
            &targets,
        );

        assert_eq!(
            result,
            ExtractOutput {
                edges: vec![Edge {
                    from_guid: "a".repeat(32),
                    to_guid: target,
                    ref_kind: "USES_TEXTURE".to_string(),
                    file_id: Some("1".to_string()),
                    context: Some("one".to_string()),
                    count: 2,
                }],
                unresolved: vec![],
                binary_serialized: false,
            }
        );
    }

    #[test]
    fn reports_unknown_and_binary_content() {
        let result = extract(
            &input("%YAML 1.1\nPrefab:\n  target: {fileID: 1, guid: cccccccccccccccccccccccccccccccc, type: 3}\n"),
            &std::collections::HashMap::new(),
        );
        assert_eq!(result.unresolved.len(), 1);
        assert_eq!(result.unresolved[0].to_guid, "c".repeat(32));
        assert!(extract(&input("binary"), &std::collections::HashMap::new()).binary_serialized);
    }

    #[test]
    fn preserves_array_context() {
        let target = "d".repeat(32);
        let mut targets = std::collections::HashMap::new();
        targets.insert(target.clone(), "Prefab".to_string());
        let result = extract(
            &input(&format!(
                "%YAML 1.1\nitems:\n- {{fileID: 1, guid: {target}, type: 3}}\n"
            )),
            &targets,
        );
        assert_eq!(result.edges[0].context.as_deref(), Some("items"));
        assert_eq!(result.edges[0].ref_kind, "NESTED_PREFAB");
    }
}
