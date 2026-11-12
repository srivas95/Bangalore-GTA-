// A flat colour, unlit and double-sided, alpha-blended or additive (_SrcBlend/_DstBlend): mission
// marker beams and rings, garage bays (three.js MeshBasicMaterial, transparent).
Shader "NammaBengaluru/Beam"
{
    Properties
    {
        _Color ("Colour", Color) = (1, 1, 1, 0.5)
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src", Float) = 5
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst", Float) = 10
    }
    SubShader
    {
        Tags { "Queue" = "Transparent" "RenderType" = "Transparent" "RenderPipeline" = "UniversalPipeline" }
        Blend [_SrcBlend] [_DstBlend]
        ZWrite Off Cull Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial)
            half4 _Color;
            CBUFFER_END
            struct A { float4 positionOS : POSITION; };
            struct V { float4 positionCS : SV_POSITION; };
            V Vert(A v) { V o; o.positionCS = TransformObjectToHClip(v.positionOS.xyz); return o; }
            half4 Frag(V i) : SV_Target { return _Color; }
            ENDHLSL
        }
    }
}
