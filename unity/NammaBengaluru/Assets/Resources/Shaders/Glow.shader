// Unlit vertex colour (lamp heads, signal lenses, lit arrows): the "glow" material of
// src/world/city.js, a MeshBasicMaterial that ignores lighting. _Boost brightens it at night.
Shader "NammaBengaluru/Glow"
{
    Properties
    {
        _BaseColor ("Colour", Color) = (1, 1, 1, 1)
        _Boost ("Night boost", Float) = 0
    }
    SubShader
    {
        Tags { "RenderType" = "Opaque" "RenderPipeline" = "UniversalPipeline" }
        Pass
        {
            Name "Unlit"
            Tags { "LightMode" = "UniversalForward" }
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #pragma multi_compile_instancing
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            CBUFFER_START(UnityPerMaterial)
                half4 _BaseColor;
                half _Boost;
            CBUFFER_END
            float _NB_Night;
            struct A { float4 positionOS : POSITION; half4 color : COLOR; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct V { float4 positionCS : SV_POSITION; half4 color : TEXCOORD0; half fog : TEXCOORD1; };
            V Vert(A v)
            {
                V o; UNITY_SETUP_INSTANCE_ID(v);
                o.positionCS = TransformObjectToHClip(v.positionOS.xyz);
                o.color = v.color * _BaseColor;
                o.fog = ComputeFogFactor(o.positionCS.z);
                return o;
            }
            half4 Frag(V i) : SV_Target
            {
                half3 c = i.color.rgb * (1.0 + _Boost * _NB_Night);
                return half4(MixFog(c, i.fog), 1);
            }
            ENDHLSL
        }
        UsePass "NammaBengaluru/City/DEPTHONLY"
    }
}
