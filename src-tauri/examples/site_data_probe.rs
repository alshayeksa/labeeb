//! Synthetic isolated WebView2 profiles; never opens the user's browser data.
use tauri::Manager;
use std::{io::{Read,Write},path::PathBuf};
async fn eval(view: &tauri::Webview, script: &str) -> Result<String,String> {
    let (tx,rx)=tokio::sync::oneshot::channel();
    let tx=std::sync::Mutex::new(Some(tx));
    view.eval_with_callback(script,move |value| {if let Some(tx)=tx.lock().unwrap().take(){let _=tx.send(value);}}).map_err(|e|e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(5),rx).await.map_err(|_|"eval timeout")?.map_err(|_|"eval closed".into())
}
async fn open(app:&tauri::AppHandle,label:&str,path:PathBuf,url:String)->Result<tauri::Webview,String>{
    let (tx,rx)=tokio::sync::oneshot::channel();let handle=app.clone();let name=label.to_string();
    app.run_on_main_thread(move||{
        let result=tauri::WebviewWindowBuilder::new(&handle,&name,tauri::WebviewUrl::External(url.parse().unwrap())).visible(false).data_directory(path).build().map_err(|e|e.to_string());
        let _=tx.send(result.map(|_|()));
    }).map_err(|e|e.to_string())?;
    rx.await.map_err(|_|"open failed")??;
    let view=app.get_webview(label).ok_or("missing view")?;
    for _ in 0..100 {
        if eval(&view,"location.protocol === 'http:' && document.readyState === 'complete'").await?=="true" {return Ok(view);}
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    }
    Err("page not ready".into())
}
fn main(){
    let profile=tempfile::tempdir().unwrap();let root=profile.path().to_owned();
    let listener=std::net::TcpListener::bind("127.0.0.1:0").unwrap();let url=format!("http://{}/",listener.local_addr().unwrap());
    std::thread::spawn(move||for mut stream in listener.incoming().flatten(){let _=stream.read(&mut[0;4096]);let _=stream.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 28\r\nConnection: close\r\n\r\n<!doctype html><title>probe</title>");});
    tauri::Builder::default().setup(move|app|{
        let handle=app.handle().clone();let watchdog=handle.clone();
        std::thread::spawn(move||{std::thread::sleep(std::time::Duration::from_secs(90));watchdog.exit(2);});
        tauri::async_runtime::spawn(async move{
            let result:Result<(),String>=async{
                let main=open(&handle,"main",root.join("main"),url.clone()).await?;
                let isolated=root.join("isolated");
                let other=open(&handle,"isolated",isolated.clone(),url.clone()).await?;
                for view in [&main,&other]{eval(view,"localStorage.setItem('probe','synthetic');document.cookie='probe=synthetic;path=/';true").await?;}
                labeeb_core::site_data::clear(&handle,isolated.clone()).await?;
                for view in [&main,&other]{
                    if eval(view,"localStorage.getItem('probe') === null && !document.cookie.includes('probe=')").await?!="true" {return Err("live profile retained data".into());}
                    eval(view,"localStorage.setItem('probe','synthetic');document.cookie='probe=synthetic;path=/';true").await?;
                }
                // Repeat with the isolated tab closed: persistent profiles count too.
                let window=handle.get_webview_window("isolated").unwrap();window.close().map_err(|e|e.to_string())?;
                for _ in 0..100{if handle.get_webview("isolated").is_none(){break;}tokio::time::sleep(std::time::Duration::from_millis(50)).await;}
                labeeb_core::site_data::clear(&handle,isolated.clone()).await?;
                let reopened=open(&handle,"isolated-reopened",isolated,url).await?;
                for view in [&main,&reopened]{
                    let clean=eval(view,"localStorage.getItem('probe') === null && !document.cookie.includes('probe=')").await?;
                    if clean!="true"{return Err(format!("profile {} retained data: {clean}",view.label()));}
                }
                Ok(())
            }.await;
            println!("site-data native profiles: {result:?}");handle.exit(if result.is_ok(){0}else{1});
        });Ok(())
    }).run(tauri::generate_context!()).expect("probe runtime");
    drop(profile);
}
