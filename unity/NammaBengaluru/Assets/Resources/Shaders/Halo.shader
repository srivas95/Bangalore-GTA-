// Soft halos round lights (port of the shader in src/world/halos.js): camera-facing quads drawn
// additively. Each vertex carries the light's world position (POSITION), its quad corner (uv)
// and size (uv1.x), and its colour; the quad is built in view space here.
Shader "NammaBengaluru/Halo"
{
    Properties
    {
        _Intensity ("Intensity", Float) = 1
        _Far ("Fade-out distance", Float) = 650
    }
    SubShader
    {
        Tags { "Queue" = "Transparent+2" "RenderType" = "Transparent" "RenderPipeline" = "UniversalPipeline" "IgnoreProjector" = "True" }
        Blend One One
        ZWrite Off Cull Off
        Pass
        {
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            float _Intensity, _Far;
            struct A { float3 positionOS : POSITION; float2 uv : TEXCOORD0; float2 size : TEXCOORD1; half4 color : COLOR; };
            struct V { float4 positionCS : SV_POSITION; float2 uv : TEXCOORD0; half3 color : TEXCOORD1; half fade : TEXCOORD2; };
            V Vert(A v)
            {
                V o;
                float3 c = TransformWorldToView(v.positionOS);
                float size = v.size.x, d = -c.z;
                // Pull the quad towards the camera so the lamp's own geometry doesn't cut it.
                c -= normalize(c) * min(size * 0.6, max(0.0, d - 0.4));
                c.xy += (v.uv - 0.5) * size;
                o.fade = smoothstep(1.0, 5.0, d) * (1.0 - smoothstep(_Far * 0.6, _Far, d));
                o.positionCS = TransformWViewToHClip(c);
                o.uv = v.uv;
                o.color = v.color.rgb;
                return o;
            }
            half4 Frag(V i) : SV_Target
            {
                float r = length(i.uv - 0.5) * 2.0;
                float a = pow(max(0.0, 1.0 - r), 2.4) + 0.35 * pow(max(0.0, 1.0 - r * 3.0), 2.0);
                return half4(i.color * a * _Intensity * i.fade, 1.0);
            }
            ENDHLSL
        }
    }
}
