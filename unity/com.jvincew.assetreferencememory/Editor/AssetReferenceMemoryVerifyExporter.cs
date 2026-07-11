using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;

namespace JVinceW.AssetReferenceMemory
{
    /// <summary>Exports Unity's direct asset-dependency truth for Node-side verification.</summary>
    public static class AssetReferenceMemoryVerifyExporter
    {
        private const string MenuPath = "Tools/Asset Reference Memory/Export Verification";

        [MenuItem(MenuPath)]
        public static void ExportDefault()
        {
            var projectRoot = Directory.GetParent(Application.dataPath).FullName;
            var outputPath = Path.Combine(projectRoot, ".asset-memory", "verify.json");
            Export(outputPath);
        }

        /// <summary>Exports direct dependencies for all Unity assets to the requested JSON path.</summary>
        public static bool Export(string outputPath)
        {
            if (string.IsNullOrWhiteSpace(outputPath))
            {
                throw new ArgumentException("An output path is required.", nameof(outputPath));
            }

            var assetPaths = AssetDatabase.GetAllAssetPaths()
                .Where(IsExportableAssetPath)
                .OrderBy(path => path, StringComparer.Ordinal)
                .ToArray();
            var assets = new List<ExportedAsset>(assetPaths.Length);

            try
            {
                for (var index = 0; index < assetPaths.Length; index++)
                {
                    var path = assetPaths[index];
                    if (EditorUtility.DisplayCancelableProgressBar(
                            "Asset Reference Memory",
                            path,
                            assetPaths.Length == 0 ? 1f : (float)index / assetPaths.Length))
                    {
                        Debug.Log("Asset Reference Memory verification export cancelled.");
                        return false;
                    }

                    var guid = AssetDatabase.AssetPathToGUID(path);
                    if (string.IsNullOrEmpty(guid))
                    {
                        continue;
                    }

                    var dependencies = AssetDatabase.GetDependencies(path, recursive: false)
                        .Where(dependency => dependency != path && IsExportableAssetPath(dependency))
                        .Select(dependency => new ExportedDependency
                        {
                            path = dependency,
                            guid = AssetDatabase.AssetPathToGUID(dependency),
                        })
                        .Where(dependency => !string.IsNullOrEmpty(dependency.guid))
                        .OrderBy(dependency => dependency.path, StringComparer.Ordinal)
                        .ToList();

                    assets.Add(new ExportedAsset
                    {
                        path = path,
                        guid = guid,
                        dependencies = dependencies,
                    });
                }

                WriteAtomically(outputPath, new VerificationExport
                {
                    schemaVersion = 1,
                    unityVersion = Application.unityVersion,
                    exportedAt = DateTime.UtcNow.ToString("O", CultureInfo.InvariantCulture),
                    assets = assets,
                });
                Debug.Log($"Asset Reference Memory verification export written to {outputPath}");
                return true;
            }
            finally
            {
                EditorUtility.ClearProgressBar();
            }
        }

        private static bool IsExportableAssetPath(string path)
        {
            if (AssetDatabase.IsValidFolder(path))
            {
                return false;
            }

            return (path.StartsWith("Assets/", StringComparison.Ordinal) ||
                    path.StartsWith("Packages/", StringComparison.Ordinal)) &&
                   path != "Packages/manifest.json" &&
                   path != "Packages/packages-lock.json";
        }

        private static void WriteAtomically(string outputPath, VerificationExport export)
        {
            var directory = Path.GetDirectoryName(outputPath);
            if (string.IsNullOrEmpty(directory))
            {
                throw new ArgumentException("The output path must include a directory.", nameof(outputPath));
            }

            Directory.CreateDirectory(directory);
            var temporaryPath = outputPath + ".tmp";
            File.WriteAllText(temporaryPath, JsonUtility.ToJson(export, true));
            if (File.Exists(outputPath))
            {
                File.Replace(temporaryPath, outputPath, null);
            }
            else
            {
                File.Move(temporaryPath, outputPath);
            }
        }

        [Serializable]
        private sealed class VerificationExport
        {
            public int schemaVersion;
            public string unityVersion;
            public string exportedAt;
            public List<ExportedAsset> assets;
        }

        [Serializable]
        private sealed class ExportedAsset
        {
            public string path;
            public string guid;
            public List<ExportedDependency> dependencies;
        }

        [Serializable]
        private sealed class ExportedDependency
        {
            public string path;
            public string guid;
        }
    }
}
