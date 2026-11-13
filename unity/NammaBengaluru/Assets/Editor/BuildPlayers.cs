// Player builds: Windows (64-bit, Mono) and Android (ARM64, IL2CPP, debug-signed unless a
// keystore is configured). Also callable from the command line:
//   unity build --target StandaloneWindows64 --execute-method NammaBengaluru.Editor.BuildPlayers.Windows --output-path Builds/Windows/NammaBengaluru.exe
//   unity build --target Android --execute-method NammaBengaluru.Editor.BuildPlayers.Android --output-path Builds/NammaBengaluru.apk
using System;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace NammaBengaluru.Editor
{
    public static class BuildPlayers
    {
        const string ID = "in.nammabengaluru.unity"; // (the web game's app is in.nammabengaluru.game)

        static string[] Scenes => EditorBuildSettings.scenes.Where(s => s.enabled).Select(s => s.path).ToArray();

        // Output path from -buildOutput (unity build --output-path), else the default.
        static string Output(string fallback)
        {
            var args = System.Environment.GetCommandLineArgs();
            int i = Array.IndexOf(args, "-buildOutput");
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : fallback;
        }

        public static void ApplyPlayerSettings()
        {
            PlayerSettings.companyName = "Namma Bengaluru";
            PlayerSettings.productName = "Namma Bengaluru";
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Standalone, ID);
            PlayerSettings.SetApplicationIdentifier(UnityEditor.Build.NamedBuildTarget.Android, ID);
            // Landscape only, either way up.
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel26;
            var icon = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Icon/icon.png");
            if (icon != null) PlayerSettings.SetIcons(UnityEditor.Build.NamedBuildTarget.Unknown, new[] { icon }, IconKind.Any);
            AssetDatabase.SaveAssets();
        }

        static void Build(BuildTarget target, BuildTargetGroup group, string path)
        {
            ApplyPlayerSettings();
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = Scenes, locationPathName = path, target = target, targetGroup = group, options = BuildOptions.None });
            var s = report.summary;
            Debug.Log($"[BuildPlayers] {target}: {s.result}, {s.totalSize / 1048576.0:F1} MB in {s.totalTime.TotalMinutes:F1} min, {s.totalErrors} errors -> {path}");
            if (Application.isBatchMode && s.result != BuildResult.Succeeded) EditorApplication.Exit(1);
        }

        [MenuItem("Tools/Namma Bengaluru/Build Windows")]
        public static void Windows() => Build(BuildTarget.StandaloneWindows64, BuildTargetGroup.Standalone, Output("Builds/Windows/NammaBengaluru.exe"));

        // (A Linux player: handy for testing a build on a Linux machine or in CI.)
        [MenuItem("Tools/Namma Bengaluru/Build Linux")]
        public static void Linux() => Build(BuildTarget.StandaloneLinux64, BuildTargetGroup.Standalone, Output("Builds/Linux/NammaBengaluru.x86_64"));

        [MenuItem("Tools/Namma Bengaluru/Build Android APK")]
        public static void Android()
        {
            EditorUserBuildSettings.buildAppBundle = false;
            // Smaller generated C++ (shared generics): a smaller app, and a build that fits in less
            // disk space; and no separate debug symbols package.
            PlayerSettings.SetIl2CppCodeGeneration(UnityEditor.Build.NamedBuildTarget.Android, UnityEditor.Build.Il2CppCodeGeneration.OptimizeSize);
            EditorUserBuildSettings.androidCreateSymbols = AndroidCreateSymbols.Disabled;
            Build(BuildTarget.Android, BuildTargetGroup.Android, Output("Builds/NammaBengaluru.apk"));
        }
    }
}
