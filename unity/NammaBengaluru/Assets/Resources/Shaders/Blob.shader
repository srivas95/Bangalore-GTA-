// Soft contact shadows (port of src/world/blobs.js): a black quad whose opacity falls off towards
// a rounded-rectangle edge, pulled slightly towards the camera so it sits on the road.
Shader "NammaBengaluru/Blob"
{
    Properties
    {
        _Opacity ("Opacity", Float) = 0.92
    }
    SubShader
    {
        Tags { "Queue" = "Transparent-1" "RenderType" = "Transparent" "RenderPipeline" = "UniversalPipeline" "IgnoreProjector" = "True" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off Cull Off
        Offset -4, -4
        Pass
        {
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            float _Opacity;
            struct A { float3 positionOS : POSITION; float2 uv : TEXCOORD0; };
            struct V { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; };
            V Vert(A v) { V o; o.positionCS = TransformObjectToHClip(v.positionOS); o.uv = v.uv; return o; }
            half4 Frag(V i) : SV_Target
            {
                float2 bq = abs(i.uv - 0.5) * 2.0;
                half a = _Opacity * (1.0 - smoothstep(0.5, 1.0, pow(pow(bq.x, 4.0) + pow(bq.y, 4.0), 0.25)));
                return half4(0, 0, 0, a);
            }
            ENDHLSL
        }
    }
}
